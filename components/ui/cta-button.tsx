import type { ButtonHTMLAttributes } from 'react';
import styles from './cta-button.module.css';

export function CtaButton({ className = '', type = 'button', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={`${styles.button} ${className}`} {...props} />;
}
