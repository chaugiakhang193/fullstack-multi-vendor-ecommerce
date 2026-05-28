"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  Layers,
  Plus,
  Edit2,
  Trash2,
  Search,
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Loader2,
  Tag,
  AlertTriangle,
} from "lucide-react";

import categoriesApiRequest from "@/apiRequests/categories";
import {
  CreateCategoryBody,
  UpdateCategoryBody,
  CreateCategoryBodyType,
  UpdateCategoryBodyType,
  CategoryResponseType,
} from "@/schemaValidations/categories.schema";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<CategoryResponseType[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Search filter
  const [searchQuery, setSearchQuery] = useState("");

  // Collapsible tree state
  const [collapsedRoots, setCollapsedRoots] = useState<Record<string, boolean>>(
    {},
  );

  // Dialog control states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  // Selected categories for edit/delete
  const [selectedCategory, setSelectedCategory] =
    useState<CategoryResponseType | null>(null);
  const [categoryToDelete, setCategoryToDelete] =
    useState<CategoryResponseType | null>(null);

  // Zod forms
  const {
    register: registerCreate,
    handleSubmit: handleSubmitCreate,
    reset: resetCreate,
    formState: { errors: createErrors, isSubmitting: isCreating },
  } = useForm<CreateCategoryBodyType>({
    resolver: zodResolver(CreateCategoryBody) as any,
    defaultValues: {
      name: "",
      parentId: "", // Đặt chuỗi rỗng tương ứng giá trị mặc định của thẻ select
      display_order: "" as any,
    },
  });

  const {
    register: registerEdit,
    handleSubmit: handleSubmitEdit,
    reset: resetEdit,
    formState: { errors: editErrors, isSubmitting: isEditing },
  } = useForm<UpdateCategoryBodyType>({
    resolver: zodResolver(UpdateCategoryBody) as any,
    defaultValues: {
      name: "",
      parentId: "",
      display_order: "" as any,
    },
  });

  // Fetch categories from API
  const fetchCategories = async () => {
    setIsLoading(true);
    try {
      const res = await categoriesApiRequest.getAll();
      setCategories(res.data || []);
    } catch (error: any) {
      const msg =
        error?.payload?.message ||
        error?.message ||
        "Không thể tải danh sách danh mục.";
      toast.error(Array.isArray(msg) ? msg.join(", ") : msg);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  // Compute stat metrics
  const stats = useMemo(() => {
    const total = categories.length;
    const roots = categories.filter((c) => !c.parent).length;
    const children = total - roots;
    return { total, roots, children };
  }, [categories]);

  // Root categories only (used for parent select option dropdowns and rendering)
  const rootCategories = useMemo(() => {
    return categories
      .filter((c) => !c.parent)
      .sort((a, b) => {
        const orderA = a.display_order ?? 0;
        const orderB = b.display_order ?? 0;
        return orderA - orderB;
      });
  }, [categories]);

  // Collapsible toggle helper
  const toggleRootCollapse = (id: string) => {
    setCollapsedRoots((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Filter and sort items based on query
  const filteredAndGrouped = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) {
      return rootCategories.map((root) => {
        const children = categories
          .filter((c) => c.parent?.id === root.id)
          .sort((a, b) => {
            const orderA = a.display_order ?? 0;
            const orderB = b.display_order ?? 0;
            return orderA - orderB;
          });
        return { root, children, forceOpen: false };
      });
    }

    return rootCategories
      .map((root) => {
        const rootMatches =
          root.name.toLowerCase().includes(query) ||
          root.slug.toLowerCase().includes(query);

        const children = categories
          .filter((c) => c.parent?.id === root.id)
          .filter(
            (c) =>
              c.name.toLowerCase().includes(query) ||
              c.slug.toLowerCase().includes(query),
          )
          .sort((a, b) => {
            const orderA = a.display_order ?? 0;
            const orderB = b.display_order ?? 0;
            return orderA - orderB;
          });

        if (rootMatches || children.length > 0) {
          return { root, children, forceOpen: true };
        }
        return null;
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }, [categories, rootCategories, searchQuery]);

  // Create submission handler
  const onCreateSubmit = async (data: CreateCategoryBodyType) => {
    try {
      const submitData = {
        ...data,
        parentId: !data.parentId || data.parentId === "" ? null : data.parentId,
      };

      await categoriesApiRequest.create(submitData as any);
      toast.success("Thêm danh mục mới thành công!");
      resetCreate();
      setIsCreateOpen(false);
      fetchCategories();
    } catch (error: any) {
      const msg =
        error?.payload?.message || error?.message || "Không thể thêm danh mục.";
      toast.error(Array.isArray(msg) ? msg.join(", ") : msg);
    }
  };

  // Edit submission handler
  const onEditSubmit = async (data: UpdateCategoryBodyType) => {
    if (!selectedCategory) return;
    try {
      const submitData = {
        ...data,
        parentId: !data.parentId || data.parentId === "" ? null : data.parentId,
      };

      await categoriesApiRequest.update(selectedCategory.id, submitData as any);
      toast.success("Cập nhật danh mục thành công!");
      setIsEditOpen(false);
      setSelectedCategory(null);
      fetchCategories();
    } catch (error: any) {
      const msg =
        error?.payload?.message ||
        error?.message ||
        "Không thể cập nhật danh mục.";
      toast.error(Array.isArray(msg) ? msg.join(", ") : msg);
    }
  };

  // Delete submission handler
  const onDeleteSubmit = async () => {
    if (!categoryToDelete) return;
    try {
      await categoriesApiRequest.delete(categoryToDelete.id);
      toast.success("Xóa danh mục thành công!");
      setIsDeleteOpen(false);
      setCategoryToDelete(null);
      fetchCategories();
    } catch (error: any) {
      const msg =
        error?.payload?.message || error?.message || "Không thể xóa danh mục.";
      toast.error(Array.isArray(msg) ? msg.join(", ") : msg);
    }
  };

  // Open Edit Dialog and pre-fill form
  const handleOpenEdit = (category: CategoryResponseType) => {
    setSelectedCategory(category);
    resetEdit({
      name: category.name,
      parentId: category.parent?.id || "",
      display_order: category.display_order ?? ("" as any),
    });
    setIsEditOpen(true);
  };

  // Open Delete Dialog with safety check
  const handleOpenDelete = (category: CategoryResponseType) => {
    const childCategories = categories.filter(
      (c) => c.parent?.id === category.id,
    );
    setCategoryToDelete({
      ...category,
      children: childCategories,
    } as any);
    setIsDeleteOpen(true);
  };

  // Tối ưu hóa UX: Kiểm tra xem danh mục đang sửa đổi có phải danh mục cha đang chứa phần tử con hay không
  const isSelectedCategoryHasChildren = useMemo(() => {
    if (!selectedCategory) return false;
    return categories.some((c) => c.parent?.id === selectedCategory.id);
  }, [selectedCategory, categories]);

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
            Quản lý Danh mục
          </h1>
          <p className="text-muted-foreground text-base md:text-lg mt-2 max-w-4xl">
            Thiết lập cấu trúc cây danh mục sản phẩm (Hỗ trợ tối đa 2 cấp danh
            mục: Gốc và Con).
          </p>
        </div>
        <Button
          onClick={() => {
            resetCreate();
            setIsCreateOpen(true);
          }}
          className="flex items-center text-sm font-bold px-5 py-2.5 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition shadow-md shadow-violet-500/20"
        >
          <Plus className="h-5 w-5 mr-2" /> Thêm danh mục
        </Button>
      </div>

      {/* Metrics Summary Cards */}
      <div className="grid gap-6 sm:grid-cols-3">
        <div className="rounded-xl border bg-gradient-to-br from-violet-500/10 to-indigo-500/10 border-violet-500/20 p-6 md:p-8 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-base font-semibold text-muted-foreground">
              Tổng số danh mục
            </span>
            <div className="p-2.5 rounded-lg bg-background/50 border shadow-sm">
              <Layers className="h-6 w-6 text-violet-500" />
            </div>
          </div>
          <div className="mt-2">
            <span className="text-3xl font-extrabold tracking-tight">
              {stats.total}
            </span>
            <p className="text-sm text-muted-foreground mt-1.5">
              Bao gồm cả danh mục gốc và con
            </p>
          </div>
        </div>

        <div className="rounded-xl border bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border-blue-500/20 p-6 md:p-8 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-base font-semibold text-muted-foreground">
              Danh mục gốc (Level 1)
            </span>
            <div className="p-2.5 rounded-lg bg-background/50 border shadow-sm">
              <Folder className="h-6 w-6 text-blue-500" />
            </div>
          </div>
          <div className="mt-2">
            <span className="text-3xl font-extrabold tracking-tight">
              {stats.roots}
            </span>
            <p className="text-sm text-muted-foreground mt-1.5">
              Danh mục cấp cao nhất
            </p>
          </div>
        </div>

        <div className="rounded-xl border bg-gradient-to-br from-pink-500/10 to-rose-500/10 border-pink-500/20 p-6 md:p-8 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-base font-semibold text-muted-foreground">
              Danh mục con (Level 2)
            </span>
            <div className="p-2.5 rounded-lg bg-background/50 border shadow-sm">
              <Tag className="h-6 w-6 text-pink-500" />
            </div>
          </div>
          <div className="mt-2">
            <span className="text-3xl font-extrabold tracking-tight">
              {stats.children}
            </span>
            <p className="text-sm text-muted-foreground mt-1.5">
              Danh mục phụ thuộc cấp 2
            </p>
          </div>
        </div>
      </div>

      {/* Main Categories Tree Content */}
      <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-5 border-b">
          <div className="relative flex-1 w-full max-w-md">
            <Search className="absolute left-3.5 top-3 h-5 w-5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Tìm kiếm danh mục theo tên hoặc slug..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-2.5 text-base border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 bg-background text-foreground"
            />
          </div>
          <button
            onClick={fetchCategories}
            className="flex items-center text-sm font-bold px-4 py-2.5 border rounded-lg hover:bg-muted transition shadow-sm bg-background"
          >
            Làm mới
          </button>
        </div>

        {/* Tree Table */}
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
              <p className="text-base font-semibold text-muted-foreground">
                Đang tải danh sách danh mục...
              </p>
            </div>
          ) : filteredAndGrouped.length === 0 ? (
            <div className="text-center py-20 text-base font-semibold text-muted-foreground">
              Không tìm thấy danh mục nào khớp với bộ lọc.
            </div>
          ) : (
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b bg-muted/40 text-sm font-extrabold text-muted-foreground uppercase tracking-wider">
                  <th className="py-4 px-6 w-[45%]">Tên danh mục</th>
                  <th className="py-4 px-6 w-[25%]">Slug danh mục</th>
                  <th className="py-4 px-6 w-[12%] text-center">Thứ tự hiển thị</th>
                  <th className="py-4 px-6 w-[10%]">Cấp độ</th>
                  <th className="py-4 px-6 w-[8%] text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y text-base">
                {filteredAndGrouped.map(({ root, children, forceOpen }) => {
                  const isCollapsed = collapsedRoots[root.id] && !forceOpen;

                  return (
                    <React.Fragment key={root.id}>
                      {/* Root Category Row */}
                      <tr className="hover:bg-muted/20 transition-colors group">
                        <td className="py-5 px-6 font-bold flex items-center gap-2.5">
                          <button
                            onClick={() => toggleRootCollapse(root.id)}
                            className="p-1.5 rounded hover:bg-muted transition text-muted-foreground"
                          >
                            {children.length > 0 ? (
                              isCollapsed ? (
                                <ChevronRight className="h-5 w-5" />
                              ) : (
                                <ChevronDown className="h-5 w-5" />
                              )
                            ) : (
                              <span className="w-5 h-5 block" />
                            )}
                          </button>
                          {children.length > 0 && !isCollapsed ? (
                            <FolderOpen className="h-5.5 w-5.5 text-blue-500 shrink-0" />
                          ) : (
                            <Folder className="h-5.5 w-5.5 text-blue-500 shrink-0" />
                          )}
                          <span className="text-foreground font-extrabold text-base md:text-lg truncate">
                            {root.name}
                          </span>
                        </td>
                        <td className="py-5 px-6 font-mono text-sm text-muted-foreground">
                          {root.slug}
                        </td>
                        <td className="py-5 px-6 text-center font-bold">
                          {root.display_order}
                        </td>
                        <td className="py-5 px-6">
                          <span className="inline-block px-3 py-1 rounded-full text-xs font-extrabold bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                            Danh mục gốc
                          </span>
                        </td>
                        <td className="py-5 px-6 text-right">
                          <div className="flex justify-end gap-1.5">
                            <button
                              onClick={() => handleOpenEdit(root)}
                              className="p-2 rounded-md hover:bg-violet-100 dark:hover:bg-violet-950 text-violet-600 dark:text-violet-400 transition"
                              title="Sửa danh mục"
                            >
                              <Edit2 className="h-5 w-5" />
                            </button>
                            <button
                              onClick={() => handleOpenDelete(root)}
                              className="p-2 rounded-md hover:bg-rose-100 dark:hover:bg-rose-950 text-rose-600 dark:text-rose-400 transition"
                              title="Xóa danh mục"
                            >
                              <Trash2 className="h-5 w-5" />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Children Category Rows */}
                      {!isCollapsed &&
                        children.map((child) => (
                          <tr
                            key={child.id}
                            className="hover:bg-muted/10 transition-colors group/child bg-zinc-50/50 dark:bg-zinc-950/20"
                          >
                            <td className="py-5 px-6 pl-12 flex items-center gap-2.5 text-muted-foreground group-hover/child:text-foreground">
                              <span className="text-zinc-300 dark:text-zinc-700 font-mono select-none pr-1.5 text-base">
                                └─
                              </span>
                              <Tag className="h-4.5 w-4.5 text-pink-500 shrink-0" />
                              <span className="font-semibold text-foreground text-sm md:text-base truncate">
                                {child.name}
                              </span>
                            </td>
                            <td className="py-5 px-6 font-mono text-sm text-muted-foreground">
                              {child.slug}
                            </td>
                            <td className="py-5 px-6 text-center font-bold">
                              {child.display_order}
                            </td>
                            <td className="py-5 px-6">
                              <span className="inline-block px-3 py-1 rounded-full text-xs font-extrabold bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                                Danh mục con
                              </span>
                            </td>
                            <td className="py-5 px-6 text-right">
                              <div className="flex justify-end gap-1.5">
                                <button
                                  onClick={() => handleOpenEdit(child)}
                                  className="p-2 rounded-md hover:bg-violet-100 dark:hover:bg-violet-950 text-violet-600 dark:text-violet-400 transition"
                                  title="Sửa danh mục"
                                >
                                  <Edit2 className="h-5 w-5" />
                                </button>
                                <button
                                  onClick={() => handleOpenDelete(child)}
                                  className="p-2 rounded-md hover:bg-rose-100 dark:hover:bg-rose-950 text-rose-600 dark:text-rose-400 transition"
                                  title="Xóa danh mục"
                                >
                                  <Trash2 className="h-5 w-5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* CREATE DIALOG */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Thêm danh mục mới</DialogTitle>
            <DialogDescription>
              Tạo danh mục mới trong hệ thống. Hệ thống chỉ hỗ trợ cấu trúc phân
              cấp tối đa 2 cấp.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={handleSubmitCreate(onCreateSubmit)}
            className="space-y-4 py-2"
          >
            <Field>
              <FieldLabel htmlFor="create-name">Tên danh mục *</FieldLabel>
              <Input
                id="create-name"
                placeholder="Ví dụ: Điện thoại, Thời trang nam..."
                {...registerCreate("name")}
                aria-invalid={!!createErrors.name}
              />
              {createErrors.name && (
                <FieldError>{createErrors.name.message?.toString()}</FieldError>
              )}
            </Field>

            <Field>
              <FieldLabel htmlFor="create-parent">
                Danh mục cha (Cấp 1)
              </FieldLabel>
              <select
                id="create-parent"
                {...registerCreate("parentId")}
                className="w-full h-9 px-3 py-1 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 bg-background text-foreground animate-fade-in"
              >
                <option value="">Không có (Danh mục gốc / Level 1)</option>
                {rootCategories.map((root) => (
                  <option key={root.id} value={root.id}>
                    {root.name}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground mt-1">
                Lưu ý: Để trống nếu muốn làm danh mục gốc. Không thể chọn danh
                mục con làm cha.
              </p>
            </Field>

            <Field>
              <FieldLabel htmlFor="create-order">Thứ tự hiển thị</FieldLabel>
              <Input
                id="create-order"
                type="number"
                {...registerCreate("display_order", { valueAsNumber: true })}
                aria-invalid={!!createErrors.display_order}
              />
              {createErrors.display_order && (
                <FieldError>
                  {createErrors.display_order.message?.toString()}
                </FieldError>
              )}
            </Field>

            <DialogFooter className="mt-6">
              <DialogClose
                render={
                  <Button variant="outline" type="button" disabled={isCreating}>
                    Hủy
                  </Button>
                }
              />
              <Button
                type="submit"
                disabled={isCreating}
                className="bg-violet-600 text-white hover:bg-violet-700"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Đang
                    lưu...
                  </>
                ) : (
                  "Tạo mới"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* EDIT DIALOG */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cập nhật danh mục</DialogTitle>
            <DialogDescription>
              Thay đổi thông tin của danh mục. Thay đổi này sẽ cập nhật trên
              toàn hệ thống sản phẩm.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={handleSubmitEdit(onEditSubmit)}
            className="space-y-4 py-2"
          >
            <Field>
              <FieldLabel htmlFor="edit-name">Tên danh mục *</FieldLabel>
              <Input
                id="edit-name"
                placeholder="Ví dụ: Laptop, Phụ kiện..."
                {...registerEdit("name")}
                aria-invalid={!!editErrors.name}
              />
              {editErrors.name && (
                <FieldError>{editErrors.name.message?.toString()}</FieldError>
              )}
            </Field>

            <Field>
              <FieldLabel htmlFor="edit-parent">
                Danh mục cha (Cấp 1)
              </FieldLabel>
              <select
                id="edit-parent"
                {...registerEdit("parentId")}
                disabled={isSelectedCategoryHasChildren} // Chặn hạ cấp danh mục cha nếu đang có chứa các phần tử con
                className="w-full h-9 px-3 py-1 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 bg-background text-foreground disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <option value="">Không có (Danh mục gốc / Level 1)</option>
                {rootCategories
                  .filter((root) => root.id !== selectedCategory?.id) // Chặn chọn chính nó
                  .map((root) => (
                    <option key={root.id} value={root.id}>
                      {root.name}
                    </option>
                  ))}
              </select>
              {isSelectedCategoryHasChildren ? (
                <p className="text-[11px] text-rose-500 font-medium mt-1">
                  ⚠️ Không thể thay đổi cấp độ vì danh mục này đang chứa danh
                  mục con khác.
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground mt-1">
                  Lưu ý: Chỉ danh mục nào không có danh mục con mới được phép
                  thay đổi cấp độ cha.
                </p>
              )}
            </Field>

            <Field>
              <FieldLabel htmlFor="edit-order">Thứ tự hiển thị</FieldLabel>
              <Input
                id="edit-order"
                type="number"
                {...registerEdit("display_order", { valueAsNumber: true })}
                aria-invalid={!!editErrors.display_order}
              />
              {editErrors.display_order && (
                <FieldError>
                  {editErrors.display_order.message?.toString()}
                </FieldError>
              )}
            </Field>

            <DialogFooter className="mt-6">
              <DialogClose
                render={
                  <Button variant="outline" type="button" disabled={isEditing}>
                    Hủy
                  </Button>
                }
              />
              <Button
                type="submit"
                disabled={isEditing}
                className="bg-violet-600 text-white hover:bg-violet-700"
              >
                {isEditing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Đang
                    lưu...
                  </>
                ) : (
                  "Cập nhật"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* DELETE DIALOG */}
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600">
              <AlertTriangle className="h-5 w-5" /> Xác nhận xóa danh mục
            </DialogTitle>
            <DialogDescription>
              Hành động này không thể hoàn tác. Danh mục bị xóa sẽ ảnh hưởng tới
              liên kết sản phẩm.
            </DialogDescription>
          </DialogHeader>

          <div className="py-3">
            {categoryToDelete && (
              <>
                {/* Chặn cứng hành động xóa nếu danh mục gốc có phần tử con */}
                {(categoryToDelete as any).children?.length > 0 ? (
                  <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 dark:bg-rose-950/20 dark:border-rose-800/40 dark:text-rose-300 text-sm space-y-2">
                    <p className="font-bold flex items-center gap-1.5">
                      ⚠️ KHÔNG THỂ XÓA DANH MỤC NÀY
                    </p>
                    <p>
                      Danh mục gốc <strong>"{categoryToDelete.name}"</strong>{" "}
                      đang chứa{" "}
                      <strong>
                        {(categoryToDelete as any).children.length}
                      </strong>{" "}
                      danh mục con:
                    </p>
                    <ul className="list-disc pl-5 font-semibold">
                      {(categoryToDelete as any).children.map((child: any) => (
                        <li key={child.id}>{child.name}</li>
                      ))}
                    </ul>
                    <p className="text-xs mt-2 italic text-rose-600 dark:text-rose-400">
                      Vui lòng xóa các danh mục con trước hoặc thay đổi danh mục
                      cha của chúng sang danh mục gốc khác trước khi xóa danh
                      mục này.
                    </p>
                  </div>
                ) : (
                  <p className="text-sm">
                    Bạn có chắc chắn muốn xóa danh mục{" "}
                    <strong className="text-rose-600">
                      "{categoryToDelete.name}"
                    </strong>{" "}
                    (Slug: <code>{categoryToDelete.slug}</code>)?
                  </p>
                )}
              </>
            )}
          </div>

          <DialogFooter className="mt-4">
            <DialogClose
              render={
                <Button variant="outline" type="button">
                  Hủy
                </Button>
              }
            />
            <Button
              onClick={onDeleteSubmit}
              disabled={
                !categoryToDelete ||
                (categoryToDelete as any).children?.length > 0
              }
              className="bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Đồng ý xóa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
