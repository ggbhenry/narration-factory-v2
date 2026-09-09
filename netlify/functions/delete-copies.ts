import type { Handler } from '@netlify/functions'
import { requireAppToken } from './_shared/auth.js'
import { initBlobs } from './_shared/blobs.js'
import { badRequest, errorToResponse, methodNotAllowed, ok } from './_shared/http.js'
import { deleteCopyPermanently, softDeleteCopy } from './_shared/destructive.js'

/**
 * Exclusão de copies. Por padrão é SOFT DELETE (vai para a lixeira).
 * Passar permanent:true apaga de vez (usado pela tela Lixeira).
 */
export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST' && event.httpMethod !== 'DELETE') return methodNotAllowed()

    initBlobs(event)
    requireAppToken(event)

    const payload = JSON.parse(event.body || '{}') as {
      copy_ids?: string[]
      copy_id?: string
      permanent?: boolean
    }
    const ids = payload.copy_ids ?? (payload.copy_id ? [payload.copy_id] : [])
    if (ids.length === 0) return badRequest('Informe copy_id ou copy_ids.')

    const processed: string[] = []
    for (const copyId of ids) {
      if (payload.permanent) {
        await deleteCopyPermanently(copyId)
      } else {
        await softDeleteCopy(copyId)
      }
      processed.push(copyId)
    }

    return ok({ deleted: processed, permanent: !!payload.permanent })
  } catch (err) {
    return errorToResponse(err)
  }
}
