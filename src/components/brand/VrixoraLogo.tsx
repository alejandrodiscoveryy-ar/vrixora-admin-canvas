import mark from "@/assets/vrixora-mark.asset.json";
import lockup from "@/assets/vrixora-lockup.asset.json";

type Props = {
  variant?: "mark" | "lockup";
  className?: string;
  size?: number;
  alt?: string;
};

export function VrixoraLogo({ variant = "mark", className, size, alt = "Vrixora" }: Props) {
  const src = variant === "lockup" ? lockup.url : mark.url;
  const style = size ? { height: size, width: variant === "mark" ? size : "auto" } : undefined;
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      style={style}
      draggable={false}
    />
  );
}
