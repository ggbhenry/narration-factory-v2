import type { Handler } from '@netlify/functions'
import { requireAppToken } from './_shared/auth.js'
import { getJSON, initBlobs, listBlobKeys } from './_shared/blobs.js'
import { errorToResponse, methodNotAllowed, ok } from './_shared/http.js'
import { slugify } from './_shared/ids.js'
import type { CopyRecord, NarrationVersion, VoicePreset } from '../../src/types/index.js'

export interface TrashCopy {
  type: 'copy'
  copy_id: string
  copy_original: string
  deleted_at: string
  version_count: number
}

export interface TrashVersion {
  type: 'version'
  copy_id: string
  version_id: string
  preset_id: string | null
  duration_seconds: number | null
  status: string
  deleted_at: string
}

export interface TrashPreset {
  type: 'preset'
  id: string
  name: string
  voice_id: string
  model_id: string
  deleted_at: string
}

/**
 * Lista tudo que está na lixeira, separado por categoria. Lê só metadata
 * (nunca baixa MP3). Uma versão excluída junto com a copy inteira NÃO aparece
 * como item avulso de versão — ela vai junto da copy.
 */
export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'GET') return methodNotAllowed()

    initBlobs(event)
    requireAppToken(event)

    // --- Copies na lixeira ---
    const copyKeys = await listBlobKeys('copies/')
    const rawCopies = await Promise.all(copyKeys.map((k) => getJSON<CopyRecord>(k)))
    const allCopies = rawCopies.filter((c): c is CopyRecord => !!c)

    const trashedCopies = allCopies.filter((c) => c.deleted_at)
    const trashedCopyIds = new Set(trashedCopies.map((c) => c.copy_id))
    const trashedCopyDeletedAt = new Map(trashedCopies.map((c) => [c.copy_id, c.deleted_at]))

    // --- Versões: percorre todas as copies (inclusive não-deletadas) ---
    const versions: TrashVersion[] = []
    const copyVersionCount = new Map<string, number>()

    await Promise.all(
      allCopies.map(async (copy) => {
        const slug = slugify(copy.copy_id)
        const vKeys = await listBlobKeys(`versions/${slug}/`)
        const vRecords = await Promise.all(vKeys.map((k) => getJSON<NarrationVersion>(k)))
        for (const v of vRecords) {
          if (!v || !v.deleted_at) continue
          // Se a versão foi para a lixeira JUNTO com a copy (mesma timestamp),
          // conta para a copy e não vira item avulso.
          const copyTs = trashedCopyDeletedAt.get(v.copy_id)
          if (trashedCopyIds.has(v.copy_id) && copyTs === v.deleted_at) {
            copyVersionCount.set(v.copy_id, (copyVersionCount.get(v.copy_id) ?? 0) + 1)
            continue
          }
          versions.push({
            type: 'version',
            copy_id: v.copy_id,
            version_id: v.version_id,
            preset_id: v.preset_id,
            duration_seconds: v.duration_seconds,
            status: v.status,
            deleted_at: v.deleted_at,
          })
        }
      }),
    )

    const copies: TrashCopy[] = trashedCopies.map((c) => ({
      type: 'copy',
      copy_id: c.copy_id,
      copy_original: c.copy_original,
      deleted_at: c.deleted_at as string,
      version_count: copyVersionCount.get(c.copy_id) ?? 0,
    }))

    // --- Presets na lixeira ---
    const presetKeys = await listBlobKeys('presets/')
    const rawPresets = await Promise.all(presetKeys.map((k) => getJSON<VoicePreset>(k)))
    const presets: TrashPreset[] = rawPresets
      .filter((p): p is VoicePreset => !!p && !!p.deleted_at)
      .map((p) => ({
        type: 'preset',
        id: p.id,
        name: p.name,
        voice_id: p.voice_id,
        model_id: p.model_id,
        deleted_at: p.deleted_at as string,
      }))

    // ordena por mais recente primeiro
    const byDate = (a: { deleted_at: string }, b: { deleted_at: string }) => b.deleted_at.localeCompare(a.deleted_at)
    copies.sort(byDate)
    versions.sort(byDate)
    presets.sort(byDate)

    return ok({ copies, versions, presets })
  } catch (err) {
    return errorToResponse(err)
  }
}
