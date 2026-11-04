export const BRAND_SLOGAN = 'Pestañas que enamoran';

export function BrandLogo({
  className = '',
  decorative = false,
}: {
  className?: string;
  decorative?: boolean;
}) {
  return (
    <img
      className={`brand-logo ${className}`}
      src="/brand/mai-lashies.jpeg"
      alt={decorative ? '' : `Logo de Mai Lashies · ${BRAND_SLOGAN}`}
      width={1254}
      height={1254}
      decoding="async"
    />
  );
}
