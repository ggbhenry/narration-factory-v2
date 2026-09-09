import type { Handler } from '@netlify/functions'
import { requireAppToken } from './_shared/auth.js'
import { getJSON, initBlobs, listBlobKeys } from './_shared/blobs.js'
import { errorToResponse, methodNotAllowed, ok } from './_shared/http.js'
import type { VoicePreset } from '../../src/types/index.js'

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'GET') return methodNotAllowed()

    initBlobs(event)
    requireAppToken(event)

    const keys = await listBlobKeys('presets/')
    const raw = await Promise.all(keys.map((key) => getJSON<VoicePreset>(key)))
    const presets = raw.filter((p): p is VoicePreset => !!p && !p.deleted_at)
    presets.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))

    return ok({ presets })
  } catch (err) {
    return errorToResponse(err)
  }
}
