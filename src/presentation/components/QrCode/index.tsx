import styles from './qr-code.module.css';

interface QrCodeProps {
  /** Modules from the QR encoder, quiet zone included; `true` = dark. */
  modules: boolean[][];
  /** "QR tiket SMD-FB-04827" */
  label: string;
  /** Rendered size in px; the SVG scales without blur. */
  size?: number;
}

/** One path of 1×1 squares on white: crisp at any size, prints well, and scanners read it on any theme. */
export default function QrCode({ modules, label, size = 132 }: QrCodeProps) {
  const count = modules.length;
  let path = '';
  modules.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) path += `M${x} ${y}h1v1h-1z`;
    }),
  );
  return (
    <svg
      className={styles.qr}
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox={`0 0 ${count} ${count}`}
      shapeRendering="crispEdges"
    >
      <rect width={count} height={count} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}
