/**
 * Seed data for order/TTS voices (Edge/Azure Neural).
 * Used to populate the voices table when empty.
 */
export interface VoiceSeedRow {
  id: string
  name: string
  locale: string
  country: string
  language: string
  gender: string
}

export const VOICE_SEED: VoiceSeedRow[] = [
  { id: 'af-ZA-AdriNeural', name: 'Adri Neural', locale: 'af-ZA', country: 'South Africa', language: 'Afrikaans', gender: 'Female' },
  { id: 'af-ZA-WillemNeural', name: 'Willem Neural', locale: 'af-ZA', country: 'South Africa', language: 'Afrikaans', gender: 'Male' },
  { id: 'am-ET-AmehaNeural', name: 'Ameha Neural', locale: 'am-ET', country: 'Ethiopia', language: 'Amharic', gender: 'Male' },
  { id: 'am-ET-MekdesNeural', name: 'Mekdes Neural', locale: 'am-ET', country: 'Ethiopia', language: 'Amharic', gender: 'Female' },
  { id: 'ar-AE-FatimaNeural', name: 'Fatima Neural', locale: 'ar-AE', country: 'United Arab Emirates', language: 'Arabic', gender: 'Female' },
  { id: 'ar-AE-HamdanNeural', name: 'Hamdan Neural', locale: 'ar-AE', country: 'United Arab Emirates', language: 'Arabic', gender: 'Male' },
  { id: 'ar-BH-AliNeural', name: 'Ali Neural', locale: 'ar-BH', country: 'Bahrain', language: 'Arabic', gender: 'Male' },
  { id: 'ar-BH-LailaNeural', name: 'Laila Neural', locale: 'ar-BH', country: 'Bahrain', language: 'Arabic', gender: 'Female' },
  { id: 'ar-DZ-AminaNeural', name: 'Amina Neural', locale: 'ar-DZ', country: 'Algeria', language: 'Arabic', gender: 'Female' },
  { id: 'ar-DZ-IsmaelNeural', name: 'Ismael Neural', locale: 'ar-DZ', country: 'Algeria', language: 'Arabic', gender: 'Male' },
  { id: 'ar-EG-SalmaNeural', name: 'Salma Neural', locale: 'ar-EG', country: 'Egypt', language: 'Arabic', gender: 'Female' },
  { id: 'ar-EG-ShakirNeural', name: 'Shakir Neural', locale: 'ar-EG', country: 'Egypt', language: 'Arabic', gender: 'Male' },
  { id: 'ar-IQ-BasselNeural', name: 'Bassel Neural', locale: 'ar-IQ', country: 'Iraq', language: 'Arabic', gender: 'Male' },
  { id: 'ar-IQ-RanaNeural', name: 'Rana Neural', locale: 'ar-IQ', country: 'Iraq', language: 'Arabic', gender: 'Female' },
  { id: 'ar-JO-SanaNeural', name: 'Sana Neural', locale: 'ar-JO', country: 'Jordan', language: 'Arabic', gender: 'Female' },
  { id: 'ar-JO-TaimNeural', name: 'Taim Neural', locale: 'ar-JO', country: 'Jordan', language: 'Arabic', gender: 'Male' },
  { id: 'ar-KW-FahedNeural', name: 'Fahed Neural', locale: 'ar-KW', country: 'Kuwait', language: 'Arabic', gender: 'Male' },
  { id: 'ar-KW-NouraNeural', name: 'Noura Neural', locale: 'ar-KW', country: 'Kuwait', language: 'Arabic', gender: 'Female' },
  { id: 'ar-LB-LaylaNeural', name: 'Layla Neural', locale: 'ar-LB', country: 'Lebanon', language: 'Arabic', gender: 'Female' },
  { id: 'ar-LB-RamiNeural', name: 'Rami Neural', locale: 'ar-LB', country: 'Lebanon', language: 'Arabic', gender: 'Male' },
  { id: 'en-PH-JamesNeural', name: 'James Neural', locale: 'en-PH', country: 'Philippines', language: 'English', gender: 'Male' },
  { id: 'en-PH-RosaNeural', name: 'Rosa Neural', locale: 'en-PH', country: 'Philippines', language: 'English', gender: 'Female' },
  { id: 'fil-PH-AngeloNeural', name: 'Angelo Neural', locale: 'fil-PH', country: 'Philippines', language: 'Filipino', gender: 'Male' },
  { id: 'fil-PH-BlessicaNeural', name: 'Blessica Neural', locale: 'fil-PH', country: 'Philippines', language: 'Filipino', gender: 'Female' },
  { id: 'en-US-AvaNeural', name: 'Ava Neural', locale: 'en-US', country: 'United States', language: 'English', gender: 'Female' },
  { id: 'en-US-AndrewNeural', name: 'Andrew Neural', locale: 'en-US', country: 'United States', language: 'English', gender: 'Male' },
  { id: 'es-ES-ElviraNeural', name: 'Elvira Neural', locale: 'es-ES', country: 'Spain', language: 'Spanish', gender: 'Female' },
  { id: 'fr-FR-DeniseNeural', name: 'Denise Neural', locale: 'fr-FR', country: 'France', language: 'French', gender: 'Female' },
  { id: 'ja-JP-NanamiNeural', name: 'Nanami Neural', locale: 'ja-JP', country: 'Japan', language: 'Japanese', gender: 'Female' },
  { id: 'zh-CN-XiaoxiaoNeural', name: 'Xiaoxiao Neural', locale: 'zh-CN', country: 'China', language: 'Chinese', gender: 'Female' },
]
