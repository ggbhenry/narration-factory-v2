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

/**
 * Persiste uma versão.
 */
export async function saveVersion(copySlug: string, version: NarrationVersion): Promise<void> {
  await setJSON(versionKey(copySlug, version.version_id), version)
}

// ============ SOFT DELETE (Lixeira) ============

/**
 * Manda uma copy para a lixeira (soft delete): marca deleted_at na copy e em
 * TODAS as suas versões. Nada é apagado de fato — MP3 e metadata continuam no
 * storage. Restaurar reverte tudo. Só "excluir permanentemente" apaga.
 */
export async function softDeleteCopy(copyId: string): Promise<CopyRecord | null> {
  const slug = slugify(copyId)
  const copy = await getJSON<CopyRecord>(copyKey(slug))
  if (!copy) return null
  const ts = nowIso()
  copy.deleted_at = ts
  copy.updated_at = ts
  await setJSON(copyKey(slug), copy)

  // marca as versões também, para o histórico ativo não mostrá-las
  const versions = await readAllVersions(slug)
  for (const v of versions) {
    if (!v.deleted_at) {
      v.deleted_at = ts
      await saveVersion(slug, v)
    }
  }
  return copy
}

/**
 * Restaura uma copy da lixeira: remove deleted_at da copy e das versões que
 * foram para a lixeira junto com ela (mesma timestamp). Recalcula o status.
 * NÃO reassume master automaticamente se o master tinha sido excluído à parte.
 */
export async function restoreCopy(copyId: string): Promise<CopyRecord | null> {
  const slug = slugify(copyId)
  const copy = await getJSON<CopyRecord>(copyKey(slug))
  if (!copy || !copy.deleted_at) return copy
  const copyDeletedAt = copy.deleted_at

  // restaura versões que foram para a lixeira JUNTO com a copy
  const allKeys = await listBlobKeys(versionPrefix(slug))
  const restored: NarrationVersion[] = []
  for (const key of allKeys) {
    const v = await getJSON<NarrationVersion>(key)
    if (!v) continue
    if (v.deleted_at && v.deleted_at === copyDeletedAt) {
      v.deleted_at = null
      await saveVersion(slug, v)
    }
    if (!v.deleted_at) restored.push(v)
  }

  delete copy.deleted_at
  recomputeCopyStateAfterDeletion(copy, restored)
  await setJSON(copyKey(slug), copy)
  return copy
}

/**
 * Manda uma versão para a lixeira (soft delete). Se for o master, limpa o
 * master e recalcula o status da copy.
 */
export async function softDeleteVersions(copyId: string, versionIds: string[]): Promise<CopyRecord | null> {
  const slug = slugify(copyId)
  const copy = await getJSON<CopyRecord>(copyKey(slug))
  if (!copy) return null

  const ts = nowIso()
  const idSet = new Set(versionIds)
  const all = await readAllVersions(slug)
  for (const v of all) {
    if (idSet.has(v.version_id) && !v.deleted_at) {
      v.deleted_at = ts
      await saveVersion(slug, v)
    }
  }

  const remaining = all.filter((v) => !idSet.has(v.version_id) && !v.deleted_at)
  recomputeCopyStateAfterDeletion(copy, remaining)
  await setJSON(copyKey(slug), copy)
  return copy
}

/**
 * Restaura versões da lixeira (remove deleted_at). Recalcula status, mas não
 * reassume master automaticamente.
 */
export async function restoreVersions(copyId: string, versionIds: string[]): Promise<CopyRecord | null> {
  const slug = slugify(copyId)
  const copy = await getJSON<CopyRecord>(copyKey(slug))
  if (!copy) return null

  const idSet = new Set(versionIds)
  const all = await readAllVersions(slug)
  for (const v of all) {
    if (idSet.has(v.version_id) && v.deleted_at) {
      v.deleted_at = null
      await saveVersion(slug, v)
    }
  }

  // se a copy estava na lixeira mas uma versão foi restaurada, mantém a copy
  // na lixeira (restaurar versão não ressuscita a copy inteira)
  const remaining = all.filter((v) => (idSet.has(v.version_id) || !v.deleted_at))
  if (!copy.deleted_at) {
    recomputeCopyStateAfterDeletion(copy, remaining.filter((v) => !v.deleted_at))
    await setJSON(copyKey(slug), copy)
  }
  return copy
}
