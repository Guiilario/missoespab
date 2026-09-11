import { NavLink } from "react-router-dom";

const ITEMS = [
  { to: "/", label: "Hoje", icon: HomeIcon },
  { to: "/ranking", label: "Ranking", icon: TrophyIcon },
  { to: "/perfil", label: "Perfil", icon: UserIcon },
];

export default function NavShell({ children }) {
  return (
    <div className="min-h-screen bg-paper">
      {/* Desktop top nav */}
      <header className="sticky top-0 z-20 hidden border-b border-black/5 bg-paper/90 backdrop-blur md:block">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <span className="font-display text-lg font-bold text-brand-600">Missões</span>
          <nav className="flex items-center gap-1">
            {ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition ${
                    isActive
                      ? "bg-brand-600 text-white"
                      : "text-ink/60 hover:bg-brand-50 hover:text-brand-700"
                  }`
                }
              >
                <item.icon />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-24 pt-6 md:px-6 md:pb-12 md:pt-8">
        {children}
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-black/5 bg-white/95 backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-md items-stretch justify-around px-2 py-2">
          {ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `flex min-w-[72px] flex-col items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-medium transition ${
                  isActive ? "text-brand-600" : "text-ink/40"
                }`
              }
            >
              <item.icon />
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

function HomeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path
        d="M4 11.5L12 4l8 7.5M6 10v9a1 1 0 001 1h4v-6h2v6h4a1 1 0 001-1v-9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrophyIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path
        d="M7 4h10v4a5 5 0 01-10 0V4zM7 5H4v1a3 3 0 003 3M17 5h3v1a3 3 0 01-3 3M12 13v3m-3 4h6m-3 0v-4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M5 20c1.2-3.5 4-5 7-5s5.8 1.5 7 5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
