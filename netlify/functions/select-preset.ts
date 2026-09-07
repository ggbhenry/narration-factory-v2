import type { Handler } from '@netlify/functions'
import { requireAppToken } from './_shared/auth.js'
import { getJSON, initBlobs, setJSON } from './_shared/blobs.js'
import { badRequest, errorToResponse, methodNotAllowed, notFound, ok } from './_shared/http.js'
import { copyKey, nowIso, presetKey, slugify } from './_shared/ids.js'
import type { CopyRecord, VoicePreset } from '../../src/types/index.js'

/**
 * Persiste a escolha de preset feita no dropdown do card de uma copy.
 * Usado quando o operador troca o preset diretamente na página Narrações.
 */
export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return methodNotAllowed()

    initBlobs(event)
    requireAppToken(event)

    const payload = JSON.parse(event.body || '{}') as { copy_id: string; preset_id: string | null }
    if (!payload.copy_id) return badRequest('copy_id é obrigatório.')

    const slug = slugify(payload.copy_id)
    const copy = await getJSON<CopyRecord>(copyKey(slug))
    if (!copy) return notFound(`Copy "${payload.copy_id}" não encontrada.`)

    if (payload.preset_id) {
      const preset = await getJSON<VoicePreset>(presetKey(slugify(payload.preset_id)))
      if (!preset) return badRequest(`Preset "${payload.preset_id}" não encontrado.`)
      copy.selected_preset_id = preset.id
    } else {
      copy.selected_preset_id = null
    }
    copy.updated_at = nowIso()
    await setJSON(copyKey(slug), copy)

    return ok({ copy })
  } catch (err) {
    return errorToResponse(err)
  }
}
