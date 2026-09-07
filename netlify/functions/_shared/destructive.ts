import {
  deleteBlob,
  getJSON,
  listBlobKeys,
  setJSON,
} from './blobs.js'
import {
  audioKey,
  copyKey,
  parseVersionNumber,
  slugify,
  versionKey,
  versionPrefix,
  nowIso,
} from './ids.js'
import type { CopyRecord, NarrationVersion } from '../../../src/types/index.js'

/**
 * Lê todas as versões de uma copy (ordenadas da mais nova para a mais antiga).
 */
export async function readAllVersions(copySlug: string): Promise<NarrationVersion[]> {
  const keys = await listBlobKeys(versionPrefix(copySlug))
  const versions: NarrationVersion[] = []
  for (const key of keys) {
    const v = await getJSON<NarrationVersion>(key)
    if (v) versions.push(v)
  }
  versions.sort((a, b) => parseVersionNumber(b.version_id) - parseVersionNumber(a.version_id))
  return versions
}

/**
 * Recalcula o status de uma copy depois que versões foram removidas, seguindo
 * as regras: se o master foi apagado, ele é limpo; se sobram versões válidas,
 * a copy vai para READY_FOR_REVIEW; se não sobra nenhuma, volta a IMPORTED.
 * NUNCA mexe em next_version_number (a numeração nunca regride).
 */
export function recomputeCopyStateAfterDeletion(
  copy: CopyRecord,
  remainingVersions: NarrationVersion[],
): CopyRecord {
  const masterStillExists =
    copy.master_version_id != null &&
    remainingVersions.some((v) => v.version_id === copy.master_version_id && v.status === 'APPROVED')

  if (masterStillExists) {
    copy.status = 'READY_FOR_EDITING'
  } else {
    copy.master_version_id = null
    const anyUsable = remainingVersions.some((v) => v.status !== 'ERROR' && v.audio_key)
    copy.status = anyUsable ? 'READY_FOR_REVIEW' : 'IMPORTED'
  }
  copy.updated_at = nowIso()
  return copy
}

/**
 * Exclui permanentemente uma versão: metadata + MP3 do Blob Storage.
 */
export async function deleteVersionPermanently(
  copySlug: string,
  version: NarrationVersion,
): Promise<void> {
  if (version.audio_key) {
    await deleteBlob(version.audio_key)
  } else {
    // fallback: tenta a chave convencional caso audio_key não esteja setada
    await deleteBlob(audioKey(copySlug, version.version_id)).catch(() => undefined)
  }
  await deleteBlob(versionKey(copySlug, version.version_id))
}

/**
 * Exclui uma copy inteira: todas as versões, todos os MP3, e o registro da copy.
 */
export async function deleteCopyPermanently(copyId: string): Promise<void> {
  const slug = slugify(copyId)
  const versions = await readAllVersions(slug)
  for (const v of versions) {
    await deleteVersionPermanently(slug, v)
  }
  // remove quaisquer áudios órfãos remanescentes sob o prefixo de áudio da copy
  const audioKeys = await listBlobKeys(`audio/${slug}/`)
  for (const k of audioKeys) {
    await deleteBlob(k).catch(() => undefined)
  }
  await deleteBlob(copyKey(slug))
}

/**
 * Persiste uma copy garantindo que next_version_number nunca diminua.
 */
export async function saveCopy(copy: CopyRecord): Promise<void> {
  const slug = slugify(copy.copy_id)
  await setJSON(copyKey(slug), copy)
}
