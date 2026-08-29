import { getSessionWithProfile } from '@/app/lib/dal';
import NavFrame from './nav-frame';
import MobileMenu from './mobile-menu';
import LanguageSwitcher from './language-switcher';
import ThemeToggle from './theme-toggle';
import ProfileMenu from './profile-menu';
import MobileAuthProfile from './mobile-auth-profile';
import NavLogo from './nav-logo';
import NavLinks from './nav-links';
import AuthButtons from './auth-buttons';
import { NAV_MENUS } from './nav-menus';

export { NAV_MENUS };

export default async function Nav() {
  const userProfile = await getSessionWithProfile();

  const desktopAuth = userProfile ? (
    <ProfileMenu name={userProfile.name} email={userProfile.email} avatarUrl={userProfile.avatarUrl} role={userProfile.role} />
  ) : (
    <AuthButtons />
  );
  const mobileAuth = userProfile ? (
    <MobileAuthProfile name={userProfile.name} email={userProfile.email} avatarUrl={userProfile.avatarUrl} />
  ) : (
    <AuthButtons />
  );

  return (
    <NavFrame>
        <div className="flex items-center gap-10">
          <NavLogo />
          <NavLinks links={NAV_MENUS} />
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden md:flex items-center gap-1">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
          <div className="hidden md:flex items-center gap-4 text-sm font-medium">{desktopAuth}</div>
          <MobileMenu links={NAV_MENUS} authSlot={mobileAuth} />
        </div>
    </NavFrame>
  );
}
