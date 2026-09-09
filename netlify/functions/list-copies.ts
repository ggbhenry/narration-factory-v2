import type { Handler } from '@netlify/functions'
import { requireAppToken } from './_shared/auth.js'
import { getJSON, initBlobs, listBlobKeys } from './_shared/blobs.js'
import { errorToResponse, methodNotAllowed, ok } from './_shared/http.js'
import { slugify, versionKey, versionPrefix, parseVersionNumber } from './_shared/ids.js'
import type { CopyRecord, NarrationVersion } from '../../src/types/index.js'

/**
 * Lê a versão mais recente de uma copy fazendo UMA única leitura de blob:
 * lista as chaves, escolhe o maior número, e busca só essa. Não relê versões
 * intermediárias (gargalo antigo). Ignora versões na lixeira (deleted_at).
 */
async function readLatestVersion(copyId: string): Promise<NarrationVersion | null> {
  const slug = slugify(copyId)
  const vKeys = await listBlobKeys(versionPrefix(slug))
  let bestKey: string | null = null
  let bestNum = -1
  for (const vKey of vKeys) {
    const m = /\/(V\d+)\.json$/.exec(vKey)
    if (!m) continue
    const num = parseVersionNumber(m[1])
    if (num > bestNum) {
      bestNum = num
      bestKey = versionKey(slug, m[1])
    }
  }
  if (!bestKey) return null
  const record = await getJSON<NarrationVersion>(bestKey)
  if (record && record.deleted_at) return null
  return record
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'GET') return methodNotAllowed()

    initBlobs(event)
    requireAppToken(event)

    const keys = await listBlobKeys('copies/')

    // Lê todas as copies em paralelo (antes era sequencial).
    const rawCopies = await Promise.all(keys.map((key) => getJSON<CopyRecord>(key)))
    const copies = rawCopies.filter((c): c is CopyRecord => !!c && !c.deleted_at)

    copies.sort((a, b) => a.copy_id.localeCompare(b.copy_id, 'pt-BR', { numeric: true }))

    // Busca a última versão de cada copy em paralelo.
    const latestList = await Promise.all(copies.map((c) => readLatestVersion(c.copy_id)))
    const latestVersions: Record<string, NarrationVersion | null> = {}
    copies.forEach((c, i) => {
      latestVersions[c.copy_id] = latestList[i]
    })

    return ok({ copies, latest_versions: latestVersions })
  } catch (err) {
    return errorToResponse(err)
  }
}
