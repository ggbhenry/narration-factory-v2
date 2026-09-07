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
} from './_shared/destructive.js'
import type { CopyRecord, NarrationVersion } from '../../src/types/index.js'

interface DeleteVersionsBody {
  copy_id: string
  version_ids?: string[]
  clear_all?: boolean
}

/**
 * Exclui versões permanentemente (metadata + MP3) OU limpa todo o histórico.
 * Nunca mexe em next_version_number — a numeração jamais regride, então a
 * próxima geração continua de onde parou (ex: apagou tudo até V008 → V009).
 * A copy_original é sempre preservada.
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

    // Garante que o contador reflita o maior número já usado antes de apagar,
    // para que a numeração futura nunca reutilize um número.
    let maxSeen = typeof copy.next_version_number === 'number' ? copy.next_version_number : 0
    for (const v of allVersions) {
      const n = parseInt(v.version_id.replace(/^V/, ''), 10)
      if (Number.isFinite(n)) maxSeen = Math.max(maxSeen, n)
    }
    copy.next_version_number = maxSeen

    let toDelete: NarrationVersion[]
    if (payload.clear_all) {
      toDelete = allVersions
    } else {
      const idSet = new Set(payload.version_ids ?? [])
      if (idSet.size === 0) return badRequest('Nenhuma versão selecionada para exclusão.')
      toDelete = allVersions.filter((v) => idSet.has(v.version_id))
    }

    for (const v of toDelete) {
      await deleteVersionPermanently(slug, v)
    }

    const deletedIds = new Set(toDelete.map((v) => v.version_id))
    const remaining = allVersions.filter((v) => !deletedIds.has(v.version_id))

    recomputeCopyStateAfterDeletion(copy, remaining)
    await saveCopy(copy)

    return ok({ copy, deleted: Array.from(deletedIds) })
  } catch (err) {
    return errorToResponse(err)
  }
}
