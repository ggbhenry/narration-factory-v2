import type { Handler } from '@netlify/functions'
import { requireAppToken } from './_shared/auth.js'
import { initBlobs } from './_shared/blobs.js'
import { badRequest, errorToResponse, methodNotAllowed, ok } from './_shared/http.js'
import { deleteCopyPermanently } from './_shared/destructive.js'

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST' && event.httpMethod !== 'DELETE') return methodNotAllowed()

    initBlobs(event)
    requireAppToken(event)

    const payload = JSON.parse(event.body || '{}') as { copy_ids?: string[]; copy_id?: string }
    const ids = payload.copy_ids ?? (payload.copy_id ? [payload.copy_id] : [])
    if (ids.length === 0) return badRequest('Informe copy_id ou copy_ids.')

    const deleted: string[] = []
    for (const copyId of ids) {
      await deleteCopyPermanently(copyId)
      deleted.push(copyId)
    }

    return ok({ deleted })
  } catch (err) {
    return errorToResponse(err)
  }
}
