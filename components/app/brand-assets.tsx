import Image from "next/image";

export const BRAND_NAME = "Manualmind";

function joinClasses(...classes: Array<string | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function BrandLogo({ className }: { className?: string }) {
  return (
    <span className={joinClasses("brand-logo", className)}>
      <Image src="/brand/logo.png" alt={`${BRAND_NAME} 로고`} fill priority sizes="220px" />
    </span>
  );
}

export function BrandMark({ className }: { className?: string }) {
  return <BrandLogo className={className} />;
}

export function BrandWordmark({ className }: { className?: string }) {
  return <BrandLogo className={className} />;
}

export function AssistantAvatar({ className, variant = "face" }: { className?: string; variant?: "face" | "full" }) {
  const isFull = variant === "full";
  return (
    <span className={joinClasses("assistant-avatar character-avatar", isFull ? "character-avatar-full" : "character-avatar-face", className)}>
      <Image
        src={isFull ? "/brand/assistant-full.png" : "/brand/assistant-face.png"}
        alt={`${BRAND_NAME} 챗봇 캐릭터`}
        fill
        sizes={isFull ? "96px" : "40px"}
      />
    </span>
  );
}
