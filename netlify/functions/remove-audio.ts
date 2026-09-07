import type { Handler } from '@netlify/functions'
import { requireAppToken } from './_shared/auth.js'
import { getJSON, initBlobs } from './_shared/blobs.js'
import { badRequest, errorToResponse, methodNotAllowed, notFound, ok } from './_shared/http.js'
import { copyKey, slugify } from './_shared/ids.js'
import { readAllVersions, recomputeCopyStateAfterDeletion, saveCopy } from './_shared/destructive.js'
import type { CopyRecord, RemoveAudioRequest } from '../../src/types/index.js'

/**
 * "Remover áudio atual" — tira a copy do estado operacional (READY_FOR_REVIEW /
 * READY_FOR_EDITING) SEM apagar nenhuma versão nem MP3. O histórico permanece
 * 100% intacto e acessível; a copy volta para um estado onde pode ser gerada
 * novamente. Diferente de excluir versão (que apaga de verdade).
 */
export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return methodNotAllowed()

    initBlobs(event)
    requireAppToken(event)

    const payload = JSON.parse(event.body || '{}') as RemoveAudioRequest
    if (!payload.copy_id) return badRequest('copy_id é obrigatório.')

    const slug = slugify(payload.copy_id)
    const copy = await getJSON<CopyRecord>(copyKey(slug))
    if (!copy) return notFound(`Copy "${payload.copy_id}" não encontrada.`)

    // Limpa o master e recoloca a copy em IMPORTED (mantendo todo o histórico).
    copy.master_version_id = null
    copy.status = 'IMPORTED'
    // As versões continuam existindo; recompute apenas confirma consistência.
    const versions = await readAllVersions(slug)
    // Força IMPORTED independentemente das versões existentes: "remover áudio"
    // é uma ação operacional explícita de tirar da área principal.
    recomputeCopyStateAfterDeletion(copy, [])
    void versions
    await saveCopy(copy)

    return ok({ copy })
  } catch (err) {
    return errorToResponse(err)
  }
}
