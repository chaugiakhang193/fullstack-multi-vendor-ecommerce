import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      {/* Sử dụng component Button của Shadcn */}
      <Button variant="default" size="lg">
        Click tôi đi!
      </Button>
    </div>
  );
}
