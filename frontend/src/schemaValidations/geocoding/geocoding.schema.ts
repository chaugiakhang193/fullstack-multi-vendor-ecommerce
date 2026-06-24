import z from 'zod';
import type { ApiEnvelope } from '@/lib/http';

// Schema cho từng gợi ý địa chỉ trả về từ backend proxy (LocationIQ / Nominatim)
export const AddressSuggestion = z.object({
  place_id: z.number(),
  display_name: z.string(),
  lat: z.string(),
  lon: z.string(),
});

// Types
export type AddressSuggestionType = z.TypeOf<typeof AddressSuggestion>;
export type AutocompleteResponseType = ApiEnvelope<AddressSuggestionType[]>;
