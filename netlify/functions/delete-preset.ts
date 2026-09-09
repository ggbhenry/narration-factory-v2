import type { Handler } from '@netlify/functions'
import { requireAppToken } from './_shared/auth.js'
import { deleteBlob, getJSON, initBlobs, setJSON } from './_shared/blobs.js'
import { badRequest, errorToResponse, methodNotAllowed, ok } from './_shared/http.js'
import { nowIso, presetKey, slugify } from './_shared/ids.js'
import type { VoicePreset } from '../../src/types/index.js'

/**
 * Exclusão de presets. Padrão: SOFT DELETE (vai para a lixeira).
 * permanent:true apaga de vez (usado pela Lixeira).
 * Copies que usavam o preset não quebram — o dropdown apenas deixa de
 * encontrá-lo e o usuário escolhe outro antes de gerar.
 */
export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST' && event.httpMethod !== 'DELETE') return methodNotAllowed()

    initBlobs(event)
    requireAppToken(event)

    const payload = JSON.parse(event.body || '{}') as { id?: string; ids?: string[]; permanent?: boolean }
    const ids = payload.ids ?? (payload.id ? [payload.id] : [])
    if (ids.length === 0) return badRequest('Informe id ou ids.')

    const processed: string[] = []
    for (const rawId of ids) {
      const slug = slugify(rawId)
      const key = presetKey(slug)
      const existing = await getJSON<VoicePreset>(key)
      if (!existing) continue
      if (payload.permanent) {
        await deleteBlob(key)
      } else {
        existing.deleted_at = nowIso()
        existing.updated_at = nowIso()
        await setJSON(key, existing)
      }
      processed.push(slug)
    }

    return ok({ deleted: processed, permanent: !!payload.permanent })
  } catch (err) {
    return errorToResponse(err)
  }
}
