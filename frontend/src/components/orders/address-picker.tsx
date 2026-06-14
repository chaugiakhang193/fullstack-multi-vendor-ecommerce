import { MapPin, Plus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AddressResponseType } from "@/schemaValidations/users/addresses.schema";

interface AddressPickerProps {
  addresses: AddressResponseType[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAddNew: () => void;
}

export function AddressPicker({
  addresses,
  selectedId,
  onSelect,
  onAddNew,
}: AddressPickerProps) {
  const hasNoAddress = addresses.length === 0;

  return (
    <section className="bg-card border rounded-xl p-6 shadow-xs space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-black text-foreground flex items-center gap-2">
          <MapPin className="h-5 w-5 text-violet-600 dark:text-violet-400" />
          Địa chỉ giao hàng
        </h2>
        <Button variant="outline" size="sm" onClick={onAddNew}>
          <Plus className="h-4 w-4" /> Thêm địa chỉ
        </Button>
      </div>

      {hasNoAddress ? (
        <div className="text-sm text-muted-foreground">
          Bạn chưa có địa chỉ giao hàng. Vui lòng thêm mới để tiếp tục.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {addresses.map((addr) => {
            const isSelected = addr.id === selectedId;
            // Gán id ra biến tường minh trước khi gọi onSelect (rule No-Inline-Arguments).
            const handleSelectThisAddress = () => {
              const addressId = addr.id;
              onSelect(addressId);
            };
            const cardClassName = cn(
              "text-left rounded-xl border p-4 transition-colors relative",
              isSelected
                ? "border-violet-500 bg-violet-50/50 dark:bg-violet-950/20 ring-1 ring-violet-500/30"
                : "border-border hover:border-violet-300 dark:hover:border-violet-800",
            );
            return (
              <button
                key={addr.id}
                type="button"
                onClick={handleSelectThisAddress}
                className={cardClassName}
              >
                {isSelected && (
                  <span className="absolute top-3 right-3 flex h-5 w-5 items-center justify-center rounded-full bg-violet-600 text-white">
                    <Check className="h-3 w-3" />
                  </span>
                )}
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-bold text-foreground">
                    {addr.recipient_name}
                  </span>
                  {addr.is_default && (
                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                      Mặc định
                    </span>
                  )}
                </div>
                <div className="text-sm text-muted-foreground">{addr.phone}</div>
                <div className="text-sm text-foreground/80 mt-1 leading-relaxed">
                  {addr.address_line}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
