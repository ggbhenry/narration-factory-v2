import type { Handler } from '@netlify/functions'
import { requireAppToken } from './_shared/auth.js'
import { deleteBlob, getJSON, initBlobs, listBlobKeys } from './_shared/blobs.js'
import { badRequest, errorToResponse, methodNotAllowed, ok } from './_shared/http.js'
import { copyKey, presetKey, slugify, versionKey } from './_shared/ids.js'
import {
  deleteCopyPermanently,
  deleteVersionPermanently,
  readAllVersions,
  recomputeCopyStateAfterDeletion,
  saveCopy,
} from './_shared/destructive.js'
import type { CopyRecord, NarrationVersion, VoicePreset } from '../../src/types/index.js'

interface EmptyTrashBody {
  copies?: string[]
  versions?: { copy_id: string; version_id: string }[]
  presets?: string[]
  // esvaziar categorias inteiras
  empty_copies?: boolean
  empty_versions?: boolean
  empty_presets?: boolean
  empty_all?: boolean
}

async function permanentlyDeleteVersion(copyId: string, versionId: string) {
  const slug = slugify(copyId)
  const version = await getJSON<NarrationVersion>(versionKey(slug, versionId))
  const copy = await getJSON<CopyRecord>(copyKey(slug))
  if (version) {
    await deleteVersionPermanently(slug, version)
  }
  if (copy) {
    const remaining = (await readAllVersions(slug)).filter((v) => !v.deleted_at)
    recomputeCopyStateAfterDeletion(copy, remaining)
    await saveCopy(copy)
  }
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST' && event.httpMethod !== 'DELETE') return methodNotAllowed()

    initBlobs(event)
    requireAppToken(event)

    const payload = JSON.parse(event.body || '{}') as EmptyTrashBody

    // ----- Esvaziar categorias inteiras -----
    if (payload.empty_all || payload.empty_copies) {
      const keys = await listBlobKeys('copies/')
      const all = await Promise.all(keys.map((k) => getJSON<CopyRecord>(k)))
      for (const c of all) {
        if (c && c.deleted_at) await deleteCopyPermanently(c.copy_id)
      }
    }

    if (payload.empty_all || payload.empty_versions) {
      const copyKeys = await listBlobKeys('copies/')
      const allCopies = await Promise.all(copyKeys.map((k) => getJSON<CopyRecord>(k)))
      for (const c of allCopies) {
        if (!c) continue
        const slug = slugify(c.copy_id)
        const versions = await readAllVersions(slug)
        const trashed = versions.filter((v) => v.deleted_at)
        for (const v of trashed) {
          await deleteVersionPermanently(slug, v)
        }
        if (trashed.length > 0) {
          const remaining = versions.filter((v) => !v.deleted_at)
          recomputeCopyStateAfterDeletion(c, remaining)
          await saveCopy(c)
        }
      }
    }

    if (payload.empty_all || payload.empty_presets) {
      const keys = await listBlobKeys('presets/')
      const all = await Promise.all(keys.map((k) => getJSON<VoicePreset>(k)))
      for (const p of all) {
        if (p && p.deleted_at) await deleteBlob(presetKey(slugify(p.id)))
      }
    }

    // ----- Itens específicos -----
    for (const copyId of payload.copies ?? []) {
      await deleteCopyPermanently(copyId)
    }
    for (const v of payload.versions ?? []) {
      await permanentlyDeleteVersion(v.copy_id, v.version_id)
    }
    for (const presetId of payload.presets ?? []) {
      await deleteBlob(presetKey(slugify(presetId)))
    }

    return ok({ ok: true })
  } catch (err) {
    return errorToResponse(err)
  }
}
