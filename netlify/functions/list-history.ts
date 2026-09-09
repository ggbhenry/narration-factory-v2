import type { Handler } from '@netlify/functions'
import { requireAppToken } from './_shared/auth.js'
import { getJSON, initBlobs, listBlobKeys } from './_shared/blobs.js'
import { errorToResponse, methodNotAllowed, ok } from './_shared/http.js'
import { slugify } from './_shared/ids.js'
import type { CopyRecord, NarrationVersion } from '../../src/types/index.js'

export interface HistoryEntry {
  copy_id: string
  version_id: string
  preset_id: string | null
  status: string
  duration_seconds: number | null
  created_at: string
  is_master: boolean
}

/**
 * Histórico global: reúne todas as gerações (versões) de todas as copies
 * ativas. Lê SÓ metadata — nunca baixa MP3. Ignora itens na lixeira.
 * Ordenado da geração mais recente para a mais antiga.
 */
export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'GET') return methodNotAllowed()

    initBlobs(event)
    requireAppToken(event)

    const copyKeys = await listBlobKeys('copies/')
    const rawCopies = await Promise.all(copyKeys.map((k) => getJSON<CopyRecord>(k)))
    const copies = rawCopies.filter((c): c is CopyRecord => !!c && !c.deleted_at)

    const entriesNested = await Promise.all(
      copies.map(async (copy) => {
        const slug = slugify(copy.copy_id)
        const vKeys = await listBlobKeys(`versions/${slug}/`)
        const vRecords = await Promise.all(vKeys.map((k) => getJSON<NarrationVersion>(k)))
        const out: HistoryEntry[] = []
        for (const v of vRecords) {
          if (!v || v.deleted_at) continue
          out.push({
            copy_id: v.copy_id,
            version_id: v.version_id,
            preset_id: v.preset_id,
            status: v.status,
            duration_seconds: v.duration_seconds,
            created_at: v.created_at,
            is_master: copy.master_version_id === v.version_id,
          })
        }
        return out
      }),
    )

    const entries = entriesNested.flat()
    entries.sort((a, b) => b.created_at.localeCompare(a.created_at))

    // lista de presets referenciados (para o filtro no front)
    const presetIds = Array.from(new Set(entries.map((e) => e.preset_id).filter((p): p is string => !!p)))

    return ok({ entries, preset_ids: presetIds })
  } catch (err) {
    return errorToResponse(err)
  }
}
