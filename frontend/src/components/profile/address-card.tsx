"use client";

import { useState } from "react";
import { MapPin, Phone, Pencil, Trash2, Star } from "lucide-react";

// Components
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

// Hooks
import { useAddresses } from "@/hooks/useAddresses";

// Types
import { AddressResponseType } from "@/schemaValidations/users/addresses.schema";

interface AddressCardProps {
  address: AddressResponseType;
  onEdit: (address: AddressResponseType) => void;
}

export function AddressCard({ address, onEdit }: AddressCardProps) {
  const { removeAddress, setDefaultAddress } = useAddresses();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleDelete = async () => {
    setBusy(true);
    const addressId = address.id;
    await removeAddress(addressId);
    setBusy(false);
    setConfirmOpen(false);
  };

  const handleSetDefault = () => {
    const addressId = address.id;
    setDefaultAddress(addressId);
  };

  const handleEditClick = () => {
    onEdit(address);
  };

  const showConfirmDelete = () => {
    const openFlag = true;
    setConfirmOpen(openFlag);
  };

  const cancelDelete = () => {
    const closeFlag = false;
    setConfirmOpen(closeFlag);
  };

  const titleText = "Xóa địa chỉ này?";
  const descText = `Hành động này không thể hoàn tác. Địa chỉ "${address.address_line}" sẽ bị xóa khỏi sổ địa chỉ.`;
  const defaultLabel = "Mặc định";
  const defaultBtnText = "Đặt mặc định";
  const editBtnText = "Sửa";
  const deleteBtnText = "Xóa";
  const cancelBtnText = "Hủy";
  const deleteConfirmBtnText = busy ? "Đang xóa..." : "Xóa";

  return (
    <div className="rounded-xl border p-5 md:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card shadow-sm hover:shadow-md transition duration-200">
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-bold text-base md:text-lg text-foreground">{address.recipient_name}</span>
          {address.is_default && (
            <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 px-2.5 py-0.5 rounded-full">
              <Star className="w-3 h-3 fill-current" /> {defaultLabel}
            </span>
          )}
        </div>

        <div className="space-y-1">
          <p className="text-sm md:text-base text-muted-foreground flex items-center gap-2">
            <Phone className="w-4 h-4 text-muted-foreground" /> {address.phone}
          </p>
          <p className="text-sm md:text-base text-foreground flex items-start gap-2">
            <MapPin className="w-4 h-4 mt-1 shrink-0 text-muted-foreground" />
            <span className="leading-relaxed">{address.address_line}</span>
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap md:flex-nowrap shrink-0 border-t md:border-t-0 pt-3 md:pt-0 border-zinc-100 dark:border-zinc-900 justify-end">
        {!address.is_default && (
          <Button
            variant="outline"
            onClick={handleSetDefault}
            className="text-sm font-semibold h-9 px-4"
          >
            {defaultBtnText}
          </Button>
        )}
        <Button variant="ghost" onClick={handleEditClick} className="text-sm font-semibold h-9 px-3">
          <Pencil className="w-4 h-4 mr-1.5" /> {editBtnText}
        </Button>
        <Button
          variant="ghost"
          className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-sm font-semibold h-9 px-3"
          onClick={showConfirmDelete}
        >
          <Trash2 className="w-4 h-4 mr-1.5" /> {deleteBtnText}
        </Button>
      </div>

      {/* Confirm xóa */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{titleText}</DialogTitle>
            <DialogDescription>
              {descText}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={cancelDelete}
              disabled={busy}
            >
              {cancelBtnText}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={busy}
            >
              {deleteConfirmBtnText}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
