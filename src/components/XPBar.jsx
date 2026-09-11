export default function XPBar({ percent, height = "h-2.5" }) {
  return (
    <div className={`w-full ${height} rounded-full bg-brand-50 overflow-hidden`}>
      <div
        className="xp-fill h-full rounded-full bg-gradient-to-r from-brand-600 to-brand-400"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
