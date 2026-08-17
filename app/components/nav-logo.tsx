import Link from 'next/link';
import Image from 'next/image';

export default function NavLogo() {
  return (
    <Link href="/" className="flex items-center">
      <span className="inline-flex items-center rounded-md px-2.5 py-1">
        <Image
          src="/logo.png"
          alt="Debate Code Logo"
          width={805}
          height={310}
          className="h-10 object-contain"
          style={{ width: 'auto' }}      
          priority
        />
      </span>
    </Link>
  );
}
