"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

// Components
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import { AddressAutocomplete } from "@/components/shared/address-autocomplete";

// Hooks
import { useAddresses } from "@/hooks/useAddresses";

// Schema & Types
import {
  AddressFormBody,
  AddressFormBodyType,
  AddressResponseType,
} from "@/schemaValidations/users/addresses.schema";

interface AddressFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: AddressResponseType | null; // null/undefined = chế độ thêm mới
}

export function AddressFormModal({
  open,
  onOpenChange,
  editing,
}: AddressFormModalProps) {
  const { createAddress, updateAddress } = useAddresses();
  const [selectedCoords, setSelectedCoords] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const initialValues = { recipient_name: "", phone: "", address_line: "" };

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<AddressFormBodyType>({
    resolver: zodResolver(AddressFormBody),
    defaultValues: initialValues,
  });

  // Prefill khi mở modal (edit) hoặc reset khi thêm mới
  useEffect(() => {
    if (!open) return;
    if (editing) {
      const editValues = {
        recipient_name: editing.recipient_name,
        phone: editing.phone,
        address_line: editing.address_line,
      };
      reset(editValues);
      // Giữ lại tọa độ cũ nếu có để không bắt buộc chọn lại
      if (editing.lat && editing.lng) {
        const coords = {
          lat: parseFloat(editing.lat),
          lng: parseFloat(editing.lng),
        };
        setSelectedCoords(coords);
      } else {
        setSelectedCoords(null);
      }
    } else {
      reset(initialValues);
      setSelectedCoords(null);
    }
  }, [open, editing, reset]);

  const onSubmit = async (values: AddressFormBodyType) => {
    setSubmitting(true);
    // lat/lng: number -> string (CreateAddressDto nhận string). Có thể null nếu
    // user chỉ gõ tay không chọn gợi ý → vẫn cho lưu (graceful), backend chấp nhận optional.
    const body = {
      recipient_name: values.recipient_name,
      phone: values.phone,
      address_line: values.address_line,
      lat: selectedCoords ? String(selectedCoords.lat) : undefined,
      lng: selectedCoords ? String(selectedCoords.lng) : undefined,
    };

    const isEditMode = !!editing;
    let ok = false;
    if (isEditMode && editing) {
      ok = await updateAddress(editing.id, body);
    } else {
      ok = await createAddress(body);
    }

    setSubmitting(false);
    if (ok) {
      const closeFlag = false;
      onOpenChange(closeFlag);
    }
  };

  const handleSelectAutocomplete = (coords: { display_name: string; lat: number; lng: number }) => {
    const valName = "address_line";
    const displayName = coords.display_name;
    const configOpts = { shouldValidate: true };
    setValue(valName, displayName, configOpts);

    const latLng = { lat: coords.lat, lng: coords.lng };
    setSelectedCoords(latLng);
  };

  const handleQueryChangeAutocomplete = (value: string) => {
    setSelectedCoords(null);
    setValue("address_line", value, { shouldValidate: true });
  };

  const dialogTitleText = editing ? "Cập nhật địa chỉ" : "Thêm địa chỉ mới";
  const descText = "Nhập thông tin người nhận. Bạn có thể chọn địa chỉ từ gợi ý hoặc nhập tay — hệ thống sẽ tự xác định tọa độ.";
  const cancelBtnText = "Hủy";
  const submitBtnText = submitting ? "Đang lưu..." : editing ? "Lưu thay đổi" : "Thêm địa chỉ";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {dialogTitleText}
          </DialogTitle>
          <DialogDescription>
            {descText}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Field>
            <FieldLabel>
              Họ tên người nhận <span className="text-rose-500">*</span>
            </FieldLabel>
            <Input
              {...register("recipient_name")}
              placeholder="Nguyễn Văn A"
            />
            <FieldError>{errors.recipient_name?.message}</FieldError>
          </Field>

          <Field>
            <FieldLabel>
              Số điện thoại <span className="text-rose-500">*</span>
            </FieldLabel>
            {(() => {
              const registerOptions = {
                setValueAs: (v: unknown) => (typeof v === "string" ? v.replace(/[\s.-]/g, "") : v),
              };
              return <Input {...register("phone", registerOptions)} placeholder="0901234567" />;
            })()}
            <FieldError>{errors.phone?.message}</FieldError>
          </Field>

          <Field>
            <FieldLabel>
              Địa chỉ chi tiết <span className="text-rose-500">*</span>
            </FieldLabel>
            <AddressAutocomplete
              value={watch("address_line")}
              onSelect={handleSelectAutocomplete}
              onQueryChange={handleQueryChangeAutocomplete}
              placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh/thành"
              error={errors.address_line?.message}
            />
          </Field>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              {cancelBtnText}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitBtnText}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
