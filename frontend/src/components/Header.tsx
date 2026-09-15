import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

/** Fixed navigation/header with brand, nav links, and a search box. */
export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (q) navigate(`/search?q=${encodeURIComponent(q)}`);
  };

  return (
    <header className={`header ${scrolled ? "header--scrolled" : ""}`}>
      <Link to="/" className="header__logo">
        NETFLOW
      </Link>
      <nav className="header__nav">
        <Link to="/">Home</Link>
        <Link to="/?type=movie">Movies</Link>
        <Link to="/?type=show">Shows</Link>
      </nav>
      <div className="header__spacer" />
      <form className="header__search" onSubmit={onSubmit} role="search">
        <input
          type="search"
          placeholder="Search titles..."
          aria-label="Search titles"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </form>
    </header>
  );
}
