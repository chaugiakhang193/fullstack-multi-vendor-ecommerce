import http from "@/lib/http";
import {
  CreateCategoryBodyType,
  UpdateCategoryBodyType,
  CategoryListResponseType,
  SingleCategoryResponseType,
} from "@/schemaValidations/categories.schema";

const categoriesApiRequest = {
  getAll: () => {
    return http.get<CategoryListResponseType>("/categories");
  },
  getDetail: (id: string) => {
    return http.get<SingleCategoryResponseType>(`/categories/${id}`);
  },
  create: (body: CreateCategoryBodyType) => {
    return http.post<SingleCategoryResponseType>("/categories", body);
  },
  update: (id: string, body: UpdateCategoryBodyType) => {
    return http.patch<SingleCategoryResponseType>(`/categories/${id}`, body);
  },
  delete: (id: string) => {
    return http.delete<any>(`/categories/${id}`);
  },
};

export default categoriesApiRequest;
