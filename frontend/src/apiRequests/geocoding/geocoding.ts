// Lib
import http from "@/lib/http";

// Schema
import { AutocompleteResponseType } from "@/schemaValidations/geocoding/geocoding.schema";

const geocodingApiRequest = {
  autocomplete: (query: string) => {
    const encodedQuery = encodeURIComponent(query);
    const requestPath = `/geocoding/autocomplete?q=${encodedQuery}`;
    return http.get<AutocompleteResponseType>(requestPath);
  },
};

export default geocodingApiRequest;
