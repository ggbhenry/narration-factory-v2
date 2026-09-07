import type { Handler } from '@netlify/functions'
import { requireAppToken } from './_shared/auth.js'
import { deleteBlob, getJSON, initBlobs } from './_shared/blobs.js'
import { badRequest, errorToResponse, methodNotAllowed, ok } from './_shared/http.js'
import { presetKey, slugify } from './_shared/ids.js'
import type { VoicePreset } from '../../src/types/index.js'

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST' && event.httpMethod !== 'DELETE') return methodNotAllowed()

    initBlobs(event)
    requireAppToken(event)

    const payload = JSON.parse(event.body || '{}') as { id?: string; ids?: string[] }
    const ids = payload.ids ?? (payload.id ? [payload.id] : [])
    if (ids.length === 0) return badRequest('Informe id ou ids.')

    const deleted: string[] = []
    for (const rawId of ids) {
      const slug = slugify(rawId)
      const key = presetKey(slug)
      const existing = await getJSON<VoicePreset>(key)
      if (!existing) continue
      await deleteBlob(key)
      deleted.push(slug)
    }

    return ok({ deleted })
  } catch (err) {
    return errorToResponse(err)
  }
}
