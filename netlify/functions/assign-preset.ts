import type { Handler } from '@netlify/functions'
import { requireAppToken } from './_shared/auth.js'
import { getJSON, initBlobs, setJSON } from './_shared/blobs.js'
import { badRequest, errorToResponse, methodNotAllowed, ok } from './_shared/http.js'
import { copyKey, nowIso, presetKey, slugify } from './_shared/ids.js'
import type { AssignPresetRequest, CopyRecord, VoicePreset } from '../../src/types/index.js'

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return methodNotAllowed()

    initBlobs(event)
    requireAppToken(event)

    const payload = JSON.parse(event.body || '{}') as AssignPresetRequest
    if (!payload.preset_id || !Array.isArray(payload.copy_ids) || payload.copy_ids.length === 0) {
      return badRequest('preset_id e copy_ids são obrigatórios.')
    }

    const preset = await getJSON<VoicePreset>(presetKey(slugify(payload.preset_id)))
    if (!preset) return badRequest(`Preset "${payload.preset_id}" não encontrado.`)

    const updated: string[] = []
    for (const copyId of payload.copy_ids) {
      const key = copyKey(slugify(copyId))
      const copy = await getJSON<CopyRecord>(key)
      if (!copy) continue
      copy.selected_preset_id = preset.id
      copy.updated_at = nowIso()
      await setJSON(key, copy)
      updated.push(copyId)
    }

    return ok({ updated, preset_id: preset.id })
  } catch (err) {
    return errorToResponse(err)
  }
}
