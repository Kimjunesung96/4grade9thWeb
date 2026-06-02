import React from 'react';

export default function Button({ children, variant = 'primary', className = '', ...props }) {
  const base = "px-4 py-2 rounded-lg font-bold transition-all text-xs select-none active:scale-98";
  const styles = {
    primary: "bg-blue-600 text-white hover:bg-blue-700 shadow-md shadow-blue-100",
    secondary: "bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200",
    dark: "bg-gray-800 text-white hover:bg-black",
    tabActive: "px-4 py-1.5 bg-white text-blue-600 shadow-sm rounded-md text-xs font-bold",
    tabInactive: "px-4 py-1.5 text-gray-500 hover:bg-gray-200/50 rounded-md text-xs font-bold"
  };
  return <button className={`${base} ${styles[variant]} ${className}`} {...props}>{children}</button>;
}