import http from "@/lib/http";
import {
  CreateCategoryBodyType,
  UpdateCategoryBodyType,
  CategoryListResponseType,
  SingleCategoryResponseType,
} from "@/schemaValidations/products/categories.schema";

const categoriesApiRequest = {
  // === C: Create ===
  create: (body: CreateCategoryBodyType) => {
    return http.post<SingleCategoryResponseType>("/categories", body);
  },

  // === R: Read ===
  getAll: () => {
    return http.get<CategoryListResponseType>("/categories");
  },

  getDetail: (id: string) => {
    return http.get<SingleCategoryResponseType>(`/categories/${id}`);
  },

  // === U: Update ===
  update: (id: string, body: UpdateCategoryBodyType) => {
    return http.patch<SingleCategoryResponseType>(`/categories/${id}`, body);
  },

  // === D: Delete ===
  delete: (id: string) => {
    return http.delete<any>(`/categories/${id}`);
  },
};

export default categoriesApiRequest;
