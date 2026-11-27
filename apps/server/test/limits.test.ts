import { describe, expect, it } from 'vitest';
import { addressKey } from '../src/limits';

describe('addressKey', () => {
  it('counts IPv4 by address, mapped into IPv6 or not', () => {
    expect(addressKey('203.0.113.7')).toBe('203.0.113.7');
    expect(addressKey('::ffff:203.0.113.7')).toBe('203.0.113.7');
  });

  it('counts IPv6 by its /64, however it is written', () => {
    const key = '2001:db8:1:2::/64';
    expect(addressKey('2001:db8:1:2:3:4:5:6')).toBe(key);
    expect(addressKey('2001:0db8:0001:0002::9')).toBe(key);
    expect(addressKey('2001:DB8:1:2::')).toBe(key);
    expect(addressKey('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(addressKey('::1')).toBe('0:0:0:0::/64');
    expect(addressKey('fe80::1%eth0')).toBe('fe80:0:0:0::/64');
  });

  it('refuses anything that is not an address', () => {
    expect(addressKey('')).toBeNull();
    expect(addressKey('not-an-ip')).toBeNull();
    expect(addressKey('203.0.113.7, 10.0.0.1')).toBeNull();
  });
});
