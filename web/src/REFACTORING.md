# Web Application Refactoring Summary

## Overview
The monolithic 6395-line `App.tsx` file has been refactored into a modular structure with clear separation of concerns.

## New Folder Structure

```
src/
├── types/
│   └── index.ts              # All TypeScript type definitions
├── helpers/
│   └── index.ts              # Utility functions and formatting helpers
├── services/
│   └── api.ts                # API calls and data loading functions
├── components/
│   └── index.tsx             # Reusable React components
├── pages/                    # (Ready for page components)
├── App.tsx                   # Main app component (now refactored)
├── App.css
├── cachedFetch.ts
├── main.tsx
└── index.css
```

## Module Breakdown

### `types/index.ts`
Exports all TypeScript type definitions:
- **Domain Models**: `Order`, `ReelItem`, `Pipeline`, `SocialAccount`, `NicheItem`, etc.
- **Enums/Unions**: `OrderStatus`, `Platform`, `StudioPreviewSize`
- **API Responses**: `VoicesResponse`, `FontsResponse`, `YoutubeStatusResponse`, `FacebookStatusResponse`
- **Sub-types**: `ClipItem`, `FontItem`, `VoiceItem`, `ClipTranscriptInfo`, `UploadRecord`, `ReelJob`

### `helpers/index.ts`
Exports utility functions organized by category:

**Constants:**
- `STUDIO_PREVIEW_SIZES` - Preview size options

**Preview & Layout:**
- `studioPreviewSizeFromDimensions()` - Determine preview size from dimensions
- `orderOutputSizeLabel()` - Get label for output size

**Formatting & Text:**
- `truncateMiddle()` - Truncate string in middle
- `orderPaymentLine()` - Format payment info for orders
- `formatCaptionHashtags()` - Normalize hashtag formatting
- `localeToFlag()` - Convert locale to flag emoji

**URL Parsing:**
- `parseFacebookPageIdFromUrl()` - Extract Facebook page ID

**Notifications:**
- `sendNotification()` - Send browser notifications

**Order Pricing:**
- `pricePerFrameForOrder()` - Calculate frame price for order tier
- `orderFramesAndPrice()` - Calculate frames and total price
- `scriptToFrameTexts()` - Split script into frame captions

### `services/api.ts`
Exports API service functions organized by domain:

**Configuration:**
- `apiConfig` - Centralized API configuration (base URLs, environment)

**Clips:**
- `loadClips()`, `loadGameClips()`, `loadOrderClips()`
- `loadOrderClipTranscripts()`

**Voices:**
- `loadVoices()`

**Fonts:**
- `loadFonts()`, `uploadFont()`, `updateFont()`, `deleteFont()`

**Reels:**
- `loadReels()`, `markReelUploaded()`
- `saveReelShowcase()`, `deleteReelShowcase()`

**Accounts:**
- `loadAllAccounts()`, `addAccount()`
- `connectAccount()`, `disconnectAccount()`, `deleteAccount()`

**Niches:**
- `loadNiches()`, `addNiche()`, `updateNiche()`, `deleteNiche()`

**Pipelines:**
- `loadPipelines()`, `savePipeline()`, `createPipeline()`, `deletePipeline()`
- `runPipeline()`, `stopPipeline()`

**Payment Methods:**
- `getPaymentMethods()`, `getEnabledPaymentMethods()`, `setPaymentMethods()`

### `components/index.tsx`
Exports reusable React components:

**OrderOutputPage**
- Displays generated reels for a customer order
- Props: `orders`, `reels`, `navigate`, `apiBaseUrl`, `apiVpsBaseUrl`, `onDeleteOrder`, `orderDeletingId`
- Features: Video player, delete order functionality

**PipelineForm**
- Form for creating/editing automated content pipelines
- Props: `pipeline`, `niches`, `facebookAccounts`, `edgeVoices`, `fonts`, `isRunning`, `apiBaseUrl`, `onSave`, `onCancel`
- Features: Dynamic form fields, Facebook page selection, voice/font configuration

### `App.tsx` (Main)
Still contains:
- Route definitions and navigation
- Global state management (useState hooks)
- Page rendering logic
- Event handlers for all features
- Now imports types, helpers, and components from dedicated modules

## Benefits of This Refactoring

1. **Better Organization**: Related code is grouped together logically
2. **Reusability**: Helper functions and components can be imported elsewhere
3. **Maintainability**: Easier to locate and modify specific functionality
4. **Testability**: Individual modules can be unit tested independently
5. **Scalability**: Easy to add new pages, services, or helpers
6. **Clarity**: Clear separation of concerns - types, logic, UI

## Usage Examples

### Importing Types
```typescript
import type { Order, Pipeline, ReelItem } from "./types";
```

### Using Helpers
```typescript
import { 
  orderPaymentLine, 
  formatCaptionHashtags, 
  scriptToFrameTexts 
} from "./helpers";
```

### Using API Services
```typescript
import { loadReels, savePipeline } from "./services/api";

const reels = await loadReels(baseUrl);
await savePipeline(baseUrl, pipelineId, data);
```

### Using Components
```typescript
import { OrderOutputPage, PipelineForm } from "./components";

<OrderOutputPage 
  orders={orders} 
  reels={reels}
  apiBaseUrl={apiBaseUrl}
/>
```

## Next Steps (Optional)

1. **Further Component Splitting**: Move other page sections into separate component files
2. **Custom Hooks**: Extract complex state logic into custom hooks (e.g., `useOrders()`, `usePipelines()`)
3. **Constants File**: Create `constants/index.ts` for magic strings and configuration values
4. **Hooks Folder**: Create `hooks/` folder for custom React hooks
5. **Utils Folder**: Create additional utility files for specific domains (ordering, uploading, etc.)

## Import Aliases (for convenience)
The following are re-exported in App.tsx for backward compatibility:
```typescript
const apiBaseUrl = apiConfig.apiBaseUrl;
const apiVpsBaseUrl = apiConfig.apiVpsBaseUrl;
const envLabel = apiConfig.envLabel;
```
