export interface PiperVoiceCatalogItem {
  id: string;
  name: string;
  description: string;
  quality: 'medium' | 'high';
  modelUrl: string;
  configUrl: string;
}

export const piperVoiceCatalog: PiperVoiceCatalogItem[] = [
  {
    id: 'en_US-lessac-medium',
    name: 'Lessac (US English)',
    description: 'Natural and balanced general-purpose narrator voice.',
    quality: 'medium',
    modelUrl:
      'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium/en_US-lessac-medium.onnx?download=true',
    configUrl:
      'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json?download=true',
  },
  {
    id: 'en_US-ryan-high',
    name: 'Ryan (US English)',
    description: 'Deeper male narrator voice with higher quality model.',
    quality: 'high',
    modelUrl:
      'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/ryan/high/en_US-ryan-high.onnx?download=true',
    configUrl:
      'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/ryan/high/en_US-ryan-high.onnx.json?download=true',
  },
  {
    id: 'en_GB-alan-medium',
    name: 'Alan (UK English)',
    description: 'British narrator tone for documentary-style reels.',
    quality: 'medium',
    modelUrl:
      'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_GB/alan/medium/en_GB-alan-medium.onnx?download=true',
    configUrl:
      'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_GB/alan/medium/en_GB-alan-medium.onnx.json?download=true',
  },
];
