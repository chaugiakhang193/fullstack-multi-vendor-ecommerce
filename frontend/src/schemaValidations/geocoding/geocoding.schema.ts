import z from "zod";

// Schema cho từng gợi ý địa chỉ trả về từ backend proxy (LocationIQ / Nominatim)
export const AddressSuggestion = z.object({
  place_id: z.number(),
  display_name: z.string(),
  lat: z.string(),
  lon: z.string(),
});

// Schema cho envelope response của endpoint /geocoding/autocomplete
export const AutocompleteResponse = z.object({
  message: z.string().optional(),
  data: z.array(AddressSuggestion),
});

// Types
export type AddressSuggestionType = z.TypeOf<typeof AddressSuggestion>;
export type AutocompleteResponseType = z.TypeOf<typeof AutocompleteResponse>;
