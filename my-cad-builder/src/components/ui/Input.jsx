import React from 'react';

export default function Input({ label, className = '', ...props }) {
  return (
    <div className="space-y-1 w-full">
      {label && <label className="text-xs font-bold text-gray-500 ml-1 block">{label}</label>}
      <input className={`w-full bg-gray-50 border border-gray-200 p-3 rounded-lg outline-none focus:border-blue-500 transition-all text-sm ${className}`} {...props} />
    </div>
  );
}