import type { Handler } from '@netlify/functions'
import { requireAppToken } from './_shared/auth.js'
import { getJSON, initBlobs } from './_shared/blobs.js'
import { badRequest, errorToResponse, methodNotAllowed, notFound, ok } from './_shared/http.js'
import { copyKey, slugify } from './_shared/ids.js'
import {
  deleteVersionPermanently,
  readAllVersions,
  recomputeCopyStateAfterDeletion,
  saveCopy,
  softDeleteVersions,
} from './_shared/destructive.js'
import type { CopyRecord, NarrationVersion } from '../../src/types/index.js'

interface DeleteVersionsBody {
  copy_id: string
  version_ids?: string[]
  clear_all?: boolean
  permanent?: boolean
}

/**
 * Exclusão de versões.
 * - Padrão: SOFT DELETE (vai para a lixeira, MP3 preservado).
 * - permanent:true: apaga metadata + MP3 de vez (usado pela Lixeira).
 * Nunca mexe em next_version_number — a numeração jamais regride.
 * clear_all limpa todo o histórico ativo (soft, salvo permanent:true).
 */
export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return methodNotAllowed()

    initBlobs(event)
    requireAppToken(event)

    const payload = JSON.parse(event.body || '{}') as DeleteVersionsBody
    if (!payload.copy_id) return badRequest('copy_id é obrigatório.')

    const slug = slugify(payload.copy_id)
    const copy = await getJSON<CopyRecord>(copyKey(slug))
    if (!copy) return notFound(`Copy "${payload.copy_id}" não encontrada.`)

    const allVersions = await readAllVersions(slug)

    // Mantém o contador coerente com o maior número já usado.
    let maxSeen = typeof copy.next_version_number === 'number' ? copy.next_version_number : 0
    for (const v of allVersions) {
      const n = parseInt(v.version_id.replace(/^V/, ''), 10)
      if (Number.isFinite(n)) maxSeen = Math.max(maxSeen, n)
    }
    copy.next_version_number = maxSeen
    await saveCopy(copy)

    // Alvo: versões ATIVAS (não já na lixeira)
    const active = allVersions.filter((v) => !v.deleted_at)
    let targetIds: string[]
    if (payload.clear_all) {
      targetIds = active.map((v) => v.version_id)
    } else {
      const idSet = new Set(payload.version_ids ?? [])
      if (idSet.size === 0) return badRequest('Nenhuma versão selecionada para exclusão.')
      targetIds = active.filter((v) => idSet.has(v.version_id)).map((v) => v.version_id)
    }

    if (payload.permanent) {
      const toDelete: NarrationVersion[] = allVersions.filter((v) => targetIds.includes(v.version_id))
      for (const v of toDelete) {
        await deleteVersionPermanently(slug, v)
      }
      const remaining = allVersions.filter((v) => !targetIds.includes(v.version_id) && !v.deleted_at)
      recomputeCopyStateAfterDeletion(copy, remaining)
      await saveCopy(copy)
      return ok({ copy, deleted: targetIds, permanent: true })
    }

    const updated = await softDeleteVersions(payload.copy_id, targetIds)
    return ok({ copy: updated ?? copy, deleted: targetIds, permanent: false })
  } catch (err) {
    return errorToResponse(err)
  }
}
