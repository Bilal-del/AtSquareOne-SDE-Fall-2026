import { Link, NavLink } from 'react-router-dom';

function SquareOneNavigation() {
  const getNavLinkClass = ({ isActive }: { isActive: boolean }) =>
    isActive ? 'site-nav__link site-nav__link--active' : 'site-nav__link';

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link className="site-brand" to="/jobs" aria-label="SquareOne job search">
          <span className="site-brand__mark" aria-hidden="true">■</span>
          SquareOne
        </Link>

        <span className="site-header__eyebrow">Career Discovery</span>

        <nav className="site-nav" aria-label="Primary navigation">
          <NavLink className={getNavLinkClass} to="/jobs">
            Find jobs
          </NavLink>
          <NavLink className={getNavLinkClass} to="/applications">
            Application tracker
          </NavLink>
        </nav>

        <div className="site-workspace" aria-label="Demo workspace">
          <span className="site-workspace__label">Demo workspace</span>
          <span className="site-workspace__avatar" aria-label="Demo user BA">BA</span>
        </div>
      </div>
    </header>
  );
}

export default SquareOneNavigation;
