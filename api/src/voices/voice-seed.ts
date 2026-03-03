/**
 * Seed data for order/TTS voices (Edge/Azure Neural).
 * Used to populate the voices table when empty.
 * sample_text: native translation of "Hello, this is a sample sentence in [language]." for voice preview.
 */
export interface VoiceSeedRow {
  id: string
  name: string
  locale: string
  country: string
  language: string
  gender: string
  sample_text: string
}

/** Native sample sentence per language (translation of "Hello, this is a sample sentence in [language]."). */
const SAMPLE_BY_LANGUAGE: Record<string, string> = {
  Afrikaans: "Hallo, dit is 'n voorbeeldsin in Afrikaans.",
  Amharic: "ሰላም፣ ይህ በአማርኛ የናሙና ዓረፍተ ነገር ነው።",
  Arabic: "مرحبا، هذه جملة نموذجية باللغة العربية.",
  English: "Hello, this is a sample sentence in English.",
  Filipino: "Kumusta, ito ay isang halimbawang pangungusap sa wikang Tagalog.",
  Spanish: "Hola, esta es una oración de ejemplo en español.",
  French: "Bonjour, ceci est une phrase d'exemple en français.",
  Japanese: "こんにちは、これは日本語のサンプル文です。",
  Chinese: "你好，这是中文的示例句子。",
}

function sample(language: string): string {
  return SAMPLE_BY_LANGUAGE[language] ?? `Hello, this is a sample sentence in ${language}.`
}

/** Order: Filipino first, then US English, then Philippines English, then the rest. */
export const VOICE_SEED: VoiceSeedRow[] = [
  // Filipino (Philippines)
  { id: 'fil-PH-AngeloNeural', name: 'Angelo Neural', locale: 'fil-PH', country: 'Philippines', language: 'Filipino', gender: 'Male', sample_text: sample('Filipino') },
  { id: 'fil-PH-BlessicaNeural', name: 'Blessica Neural', locale: 'fil-PH', country: 'Philippines', language: 'Filipino', gender: 'Female', sample_text: sample('Filipino') },
  // English (United States)
  { id: 'en-US-AvaNeural', name: 'Ava Neural', locale: 'en-US', country: 'United States', language: 'English', gender: 'Female', sample_text: sample('English') },
  { id: 'en-US-AndrewNeural', name: 'Andrew Neural', locale: 'en-US', country: 'United States', language: 'English', gender: 'Male', sample_text: sample('English') },
  // English (Philippines)
  { id: 'en-PH-JamesNeural', name: 'James Neural', locale: 'en-PH', country: 'Philippines', language: 'English', gender: 'Male', sample_text: sample('English') },
  { id: 'en-PH-RosaNeural', name: 'Rosa Neural', locale: 'en-PH', country: 'Philippines', language: 'English', gender: 'Female', sample_text: sample('English') },
  // Other languages
  { id: 'af-ZA-AdriNeural', name: 'Adri Neural', locale: 'af-ZA', country: 'South Africa', language: 'Afrikaans', gender: 'Female', sample_text: sample('Afrikaans') },
  { id: 'af-ZA-WillemNeural', name: 'Willem Neural', locale: 'af-ZA', country: 'South Africa', language: 'Afrikaans', gender: 'Male', sample_text: sample('Afrikaans') },
  { id: 'am-ET-AmehaNeural', name: 'Ameha Neural', locale: 'am-ET', country: 'Ethiopia', language: 'Amharic', gender: 'Male', sample_text: sample('Amharic') },
  { id: 'am-ET-MekdesNeural', name: 'Mekdes Neural', locale: 'am-ET', country: 'Ethiopia', language: 'Amharic', gender: 'Female', sample_text: sample('Amharic') },
  { id: 'ar-AE-FatimaNeural', name: 'Fatima Neural', locale: 'ar-AE', country: 'United Arab Emirates', language: 'Arabic', gender: 'Female', sample_text: sample('Arabic') },
  { id: 'ar-AE-HamdanNeural', name: 'Hamdan Neural', locale: 'ar-AE', country: 'United Arab Emirates', language: 'Arabic', gender: 'Male', sample_text: sample('Arabic') },
  { id: 'ar-BH-AliNeural', name: 'Ali Neural', locale: 'ar-BH', country: 'Bahrain', language: 'Arabic', gender: 'Male', sample_text: sample('Arabic') },
  { id: 'ar-BH-LailaNeural', name: 'Laila Neural', locale: 'ar-BH', country: 'Bahrain', language: 'Arabic', gender: 'Female', sample_text: sample('Arabic') },
  { id: 'ar-DZ-AminaNeural', name: 'Amina Neural', locale: 'ar-DZ', country: 'Algeria', language: 'Arabic', gender: 'Female', sample_text: sample('Arabic') },
  { id: 'ar-DZ-IsmaelNeural', name: 'Ismael Neural', locale: 'ar-DZ', country: 'Algeria', language: 'Arabic', gender: 'Male', sample_text: sample('Arabic') },
  { id: 'ar-EG-SalmaNeural', name: 'Salma Neural', locale: 'ar-EG', country: 'Egypt', language: 'Arabic', gender: 'Female', sample_text: sample('Arabic') },
  { id: 'ar-EG-ShakirNeural', name: 'Shakir Neural', locale: 'ar-EG', country: 'Egypt', language: 'Arabic', gender: 'Male', sample_text: sample('Arabic') },
  { id: 'ar-IQ-BasselNeural', name: 'Bassel Neural', locale: 'ar-IQ', country: 'Iraq', language: 'Arabic', gender: 'Male', sample_text: sample('Arabic') },
  { id: 'ar-IQ-RanaNeural', name: 'Rana Neural', locale: 'ar-IQ', country: 'Iraq', language: 'Arabic', gender: 'Female', sample_text: sample('Arabic') },
  { id: 'ar-JO-SanaNeural', name: 'Sana Neural', locale: 'ar-JO', country: 'Jordan', language: 'Arabic', gender: 'Female', sample_text: sample('Arabic') },
  { id: 'ar-JO-TaimNeural', name: 'Taim Neural', locale: 'ar-JO', country: 'Jordan', language: 'Arabic', gender: 'Male', sample_text: sample('Arabic') },
  { id: 'ar-KW-FahedNeural', name: 'Fahed Neural', locale: 'ar-KW', country: 'Kuwait', language: 'Arabic', gender: 'Male', sample_text: sample('Arabic') },
  { id: 'ar-KW-NouraNeural', name: 'Noura Neural', locale: 'ar-KW', country: 'Kuwait', language: 'Arabic', gender: 'Female', sample_text: sample('Arabic') },
  { id: 'ar-LB-LaylaNeural', name: 'Layla Neural', locale: 'ar-LB', country: 'Lebanon', language: 'Arabic', gender: 'Female', sample_text: sample('Arabic') },
  { id: 'ar-LB-RamiNeural', name: 'Rami Neural', locale: 'ar-LB', country: 'Lebanon', language: 'Arabic', gender: 'Male', sample_text: sample('Arabic') },
  { id: 'es-ES-ElviraNeural', name: 'Elvira Neural', locale: 'es-ES', country: 'Spain', language: 'Spanish', gender: 'Female', sample_text: sample('Spanish') },
  { id: 'fr-FR-DeniseNeural', name: 'Denise Neural', locale: 'fr-FR', country: 'France', language: 'French', gender: 'Female', sample_text: sample('French') },
  { id: 'ja-JP-NanamiNeural', name: 'Nanami Neural', locale: 'ja-JP', country: 'Japan', language: 'Japanese', gender: 'Female', sample_text: sample('Japanese') },
  { id: 'zh-CN-XiaoxiaoNeural', name: 'Xiaoxiao Neural', locale: 'zh-CN', country: 'China', language: 'Chinese', gender: 'Female', sample_text: sample('Chinese') },
]
