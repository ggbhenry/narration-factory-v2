import type { Handler } from '@netlify/functions'
import { requireAppToken } from './_shared/auth.js'
import { getJSON, initBlobs, setJSON } from './_shared/blobs.js'
import { badRequest, errorToResponse, methodNotAllowed, ok } from './_shared/http.js'
import { presetKey, slugify } from './_shared/ids.js'
import { restoreCopy, restoreVersions } from './_shared/destructive.js'
import type { VoicePreset } from '../../src/types/index.js'

interface RestoreBody {
  copies?: string[]
  versions?: { copy_id: string; version_id: string }[]
  presets?: string[]
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return methodNotAllowed()

    initBlobs(event)
    requireAppToken(event)

    const payload = JSON.parse(event.body || '{}') as RestoreBody
    const copies = payload.copies ?? []
    const versions = payload.versions ?? []
    const presets = payload.presets ?? []

    if (copies.length === 0 && versions.length === 0 && presets.length === 0) {
      return badRequest('Nada para restaurar.')
    }

    for (const copyId of copies) {
      await restoreCopy(copyId)
    }

    // agrupa versões por copy
    const byCopy = new Map<string, string[]>()
    for (const v of versions) {
      const arr = byCopy.get(v.copy_id) ?? []
      arr.push(v.version_id)
      byCopy.set(v.copy_id, arr)
    }
    for (const [copyId, versionIds] of byCopy) {
      await restoreVersions(copyId, versionIds)
    }

    for (const presetId of presets) {
      const key = presetKey(slugify(presetId))
      const preset = await getJSON<VoicePreset>(key)
      if (preset && preset.deleted_at) {
        delete preset.deleted_at
        preset.updated_at = new Date().toISOString()
        await setJSON(key, preset)
      }
    }

    return ok({ restored: { copies, versions, presets } })
  } catch (err) {
    return errorToResponse(err)
  }
}
