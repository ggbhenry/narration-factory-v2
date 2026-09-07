import type { Handler } from '@netlify/functions'
import { requireAppToken } from './_shared/auth.js'
import {
  getJSON,
  initBlobs,
  listBlobKeys,
  setBinary,
  setJSON,
  setJSONIfNew,
} from './_shared/blobs.js'
import { badRequest, errorToResponse, HttpError, methodNotAllowed, notFound, ok } from './_shared/http.js'
import {
  audioKey,
  copyKey,
  formatVersionId,
  nowIso,
  parseVersionNumber,
  presetKey,
  slugify,
  versionKey,
  versionPrefix,
} from './_shared/ids.js'
import { generateSpeech } from './_shared/elevenlabs.js'
import { getMp3DurationSeconds } from './_shared/mp3duration.js'
import {
  assertNonEmptyText,
  assertPresetReadyToGenerate,
  assertValidSettings,
  assertVoiceAndModel,
} from './_shared/validation.js'
import type {
  CopyRecord,
  GenerateRequest,
  GenerateResponse,
  NarrationVersion,
  VoicePreset,
  VoiceSettings,
} from '../../src/types/index.js'

/**
 * Reserva o próximo número de versão usando o contador persistente
 * `next_version_number` da copy. Esse contador NUNCA regride, mesmo que
 * versões sejam apagadas ou o histórico seja limpo — garantindo que um
 * número de versão jamais seja reutilizado. Retorna o novo versionId e o
 * valor atualizado do contador (o chamador persiste a copy).
 */
async function reserveNextVersionId(
  copySlug: string,
  copy: CopyRecord,
): Promise<{ versionId: string; nextCounter: number }> {
  // baseline a partir do contador salvo...
  let base = typeof copy.next_version_number === 'number' ? copy.next_version_number : 0
  // ...mas nunca abaixo do maior número que ainda existe em disco (defensivo
  // contra registros antigos criados antes do contador existir).
  const keys = await listBlobKeys(versionPrefix(copySlug))
  for (const k of keys) {
    const m = /\/(V\d+)\.json$/.exec(k)
    if (m) base = Math.max(base, parseVersionNumber(m[1]))
  }

  let attempt = base + 1
  for (let i = 0; i < 8; i++) {
    const versionId = formatVersionId(attempt)
    const reserved = await setJSONIfNew(versionKey(copySlug, versionId), {
      version_id: versionId,
      copy_id: copy.copy_id,
      status: 'GENERATING',
      created_at: nowIso(),
    })
    if (reserved) return { versionId, nextCounter: attempt }
    attempt += 1
  }
  throw new HttpError(500, 'Não foi possível reservar um número de versão (muitas tentativas simultâneas). Tente novamente.')
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed()

  initBlobs(event)

  let copySlug: string | null = null
  let copyKeyPath: string | null = null

  try {
    requireAppToken(event)

    const payload = JSON.parse(event.body || '{}') as GenerateRequest
    if (!payload.copy_id) return badRequest('copy_id é obrigatório.')

    copySlug = slugify(payload.copy_id)
    copyKeyPath = copyKey(copySlug)

    const copy = await getJSON<CopyRecord>(copyKeyPath)
    if (!copy) return notFound(`Copy "${payload.copy_id}" não encontrada.`)

    // Determina texto a narrar (permite edição pontual via copy_tts no payload)
    let copyTts = copy.copy_tts
    if (typeof payload.copy_tts === 'string' && payload.copy_tts.trim().length > 0) {
      copyTts = assertNonEmptyText(payload.copy_tts, 'copy_tts')
    } else {
      copyTts = assertNonEmptyText(copyTts, 'copy_tts')
    }

    // Resolve preset: usa o preset do payload, ou o preset selecionado da copy.
    const effectivePresetId = payload.preset_id ?? copy.selected_preset_id ?? null
    let preset: VoicePreset | null = null
    if (effectivePresetId) {
      preset = await getJSON<VoicePreset>(presetKey(slugify(effectivePresetId)))
      assertPresetReadyToGenerate(preset, effectivePresetId)
    }

    const voiceId = payload.voice_id ?? preset?.voice_id ?? ''
    const modelId = payload.model_id ?? preset?.model_id ?? ''
    assertVoiceAndModel(voiceId, modelId)

    const rawSettings: Partial<VoiceSettings> =
      payload.settings ??
      (preset
        ? {
            stability: preset.stability,
            similarity_boost: preset.similarity_boost,
            style: preset.style,
            speed: preset.speed,
            use_speaker_boost: preset.use_speaker_boost,
          }
        : {})
    const settings = assertValidSettings(rawSettings)

    // Persiste copy_tts editado como novo baseline da copy (não afeta copy_original)
    const now = nowIso()
    if (copyTts !== copy.copy_tts) {
      copy.copy_tts = copyTts
    }
    copy.status = 'GENERATING'
    copy.updated_at = now
    copy.last_error = null
    await setJSON(copyKeyPath, copy)

    // Reserva o próximo número de versão via contador persistente
    const { versionId, nextCounter } = await reserveNextVersionId(copySlug, copy)
    copy.next_version_number = nextCounter
    await setJSON(copyKeyPath, copy)

    let audioBuffer: Buffer
    try {
      audioBuffer = await generateSpeech({
        text: copyTts,
        voiceId,
        modelId,
        settings,
      })
    } catch (ttsErr) {
      const message = ttsErr instanceof Error ? ttsErr.message : 'Falha ao gerar narração.'
      const errorVersion: NarrationVersion = {
        version_id: versionId,
        copy_id: copy.copy_id,
        copy_tts: copyTts,
        preset_id: effectivePresetId,
        voice_id: voiceId,
        model_id: modelId,
        settings,
        audio_key: null,
        duration_seconds: null,
        status: 'ERROR',
        error_message: message,
        created_at: now,
      }
      await setJSON(versionKey(copySlug, versionId), errorVersion)

      copy.status = 'ERROR'
      copy.last_error = message
      copy.updated_at = nowIso()
      await setJSON(copyKeyPath, copy)

      throw ttsErr
    }

    const durationSeconds = await getMp3DurationSeconds(audioBuffer)
    const audioBlobKey = audioKey(copySlug, versionId)
    await setBinary(audioBlobKey, audioBuffer)

    const version: NarrationVersion = {
      version_id: versionId,
      copy_id: copy.copy_id,
      copy_tts: copyTts,
      preset_id: effectivePresetId,
      voice_id: voiceId,
      model_id: modelId,
      settings,
      audio_key: audioBlobKey,
      duration_seconds: durationSeconds,
      status: 'GENERATED',
      created_at: now,
    }
    await setJSON(versionKey(copySlug, versionId), version)

    copy.status = 'READY_FOR_REVIEW'
    copy.updated_at = nowIso()
    await setJSON(copyKeyPath, copy)

    // Salvar configuração atual como novo preset, se solicitado
    if (payload.save_as_preset_name && payload.save_as_preset_name.trim()) {
      const baseSlug = slugify(payload.save_as_preset_name)
      let slug = baseSlug
      let suffix = 2
      // eslint-disable-next-line no-await-in-loop
      while (await getJSON<VoicePreset>(presetKey(slug))) {
        slug = `${baseSlug}-${suffix}`
        suffix += 1
      }
      const newPreset: VoicePreset = {
        id: slug,
        name: payload.save_as_preset_name.trim(),
        voice_id: voiceId,
        model_id: modelId,
        ...settings,
        created_at: nowIso(),
        updated_at: nowIso(),
      }
      await setJSON(presetKey(slug), newPreset)
    }

    const response: GenerateResponse = { copy, version }
    return ok(response)
  } catch (err) {
    return errorToResponse(err)
  }
}
