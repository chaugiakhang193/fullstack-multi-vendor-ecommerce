"use client";

import { useState } from "react";
import { MapPin, Plus } from "lucide-react";

// Components
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { AddressCard } from "@/components/profile/address-card";
import { AddressFormModal } from "@/components/profile/address-form-modal";

// Hooks
import { useAddresses } from "@/hooks/useAddresses";
import { USER_LIMITS } from "@/constants/limits.generated";

// Types
import { AddressResponseType } from "@/schemaValidations/users/addresses.schema";

export default function AddressesPage() {
  const { addresses = [], isLoading } = useAddresses();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AddressResponseType | null>(null);

  const isLimitReached = addresses.length >= USER_LIMITS.MAX_ADDRESSES;

  const openCreate = () => {
    if (isLimitReached) return;
    setEditing(null);
    const openFlag = true;
    setModalOpen(openFlag);
  };

  const openEdit = (address: AddressResponseType) => {
    setEditing(address);
    const openFlag = true;
    setModalOpen(openFlag);
  };

  const hasAddresses = addresses.length > 0;
  const skeletonArray = [1, 2];

  const emptyStateTitle = "Chưa có địa chỉ nào";
  const emptyStateDesc = "Thêm địa chỉ giao hàng để thanh toán nhanh hơn ở những lần mua sau.";
  const emptyStateActionLabel = "Thêm địa chỉ mới";

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
          Sổ địa chỉ
        </h1>
        {hasAddresses && (
          <Button
            onClick={openCreate}
            disabled={isLimitReached}
            className="h-10 px-5 text-sm font-bold shadow-md shadow-violet-500/10"
            title={isLimitReached ? `Bạn đã đạt giới hạn tối đa ${USER_LIMITS.MAX_ADDRESSES} địa chỉ` : undefined}
          >
            <Plus className="w-4 h-4 mr-1.5" /> Thêm địa chỉ
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {skeletonArray.map((i) => (
            <div
              key={i}
              className="h-28 rounded-xl border bg-zinc-100/60 dark:bg-zinc-900/40 animate-pulse"
            />
          ))}
        </div>
      ) : !hasAddresses ? (
        <EmptyState
          icon={<MapPin className="w-8 h-8" />}
          title={emptyStateTitle}
          description={emptyStateDesc}
          actionLabel={emptyStateActionLabel}
          onAction={openCreate}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {addresses.map((address) => (
            <AddressCard key={address.id} address={address} onEdit={openEdit} />
          ))}
        </div>
      )}

      <AddressFormModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        editing={editing}
      />
    </div>
  );
}
