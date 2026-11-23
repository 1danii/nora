/**
 * Radix's LightningBoltIcon, filled: only its outer outline, without the inner
 * cut-out (Radix ships no filled variant). Same 15×15 grid as Radix icons.
 */
export const LightningBoltFilledIcon = ({
  className,
}: {
  className?: string;
}) => (
  <svg
    aria-hidden="true"
    className={className}
    fill="none"
    height="15"
    viewBox="0 0 15 15"
    width="15"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M8.69667 0.0403541C8.90859 0.131038 9.03106 0.354857 8.99316 0.582235L8.0902 6.00001H12.5C12.6893 6.00001 12.8625 6.10701 12.9472 6.27641C13.0319 6.4458 13.0136 6.6485 12.8999 6.80001L6.89997 14.8C6.76167 14.9844 6.51521 15.0503 6.30328 14.9597C6.09135 14.869 5.96888 14.6452 6.00678 14.4178L6.90974 9H2.49999C2.31061 9 2.13748 8.893 2.05278 8.72361C1.96809 8.55422 1.98636 8.35151 2.09999 8.2L8.09997 0.200038C8.23828 0.0156255 8.48474 -0.0503301 8.69667 0.0403541Z"
      fill="currentColor"
    />
  </svg>
);
