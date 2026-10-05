import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ id: 'list-1' }), Stack: { Screen: () => null } }));
const mockGet = jest.fn(); const mockSave = jest.fn(); const mockPause = jest.fn(); const mockConnect = jest.fn(); const mockConfirm = jest.fn();
jest.mock('../../../api/shopping', () => ({ shoppingEmailApi: { get: (...args: unknown[]) => mockGet(...args), save: (...args: unknown[]) => mockSave(...args), pause: (...args: unknown[]) => mockPause(...args), connect: (...args: unknown[]) => mockConnect(...args), confirmGmail: (...args: unknown[]) => mockConfirm(...args) } }));
const mockGmail = jest.fn();
jest.mock('../../moments/device', () => ({ connectGmail: (...args: unknown[]) => mockGmail(...args), EMAIL_CONNECT_FAILED: 'Connection cancelled' }));
jest.mock('../store', () => ({ useShopping: (select: (state: unknown) => unknown) => select({ lists: [{ id: 'list-1', title: 'Saturday groceries', timeZone: 'America/Los_Angeles', items: [{ id: '1', name: 'Milk', quantity: '2', size: 'litres', notes: '', checked: false }, { id: '2', name: 'Eggs', quantity: '1', size: '', notes: '', checked: true }] }] }) }));
import Screen from '../../../../app/wellness/shopping/email';
const initial = { available: true, account: { email: 'me@example.com', status: 'connected' }, schedule: null };
beforeEach(() => { jest.clearAllMocks(); mockGet.mockResolvedValue(initial); mockSave.mockResolvedValue(initial); });
it('defaults to Saturday 10 AM, previews checked items and requires consent', async () => {
 await render(<Screen />); await screen.findByLabelText('Recipient name');
 expect(screen.getByLabelText('Delivery time').props.value).toBe('10:00');
 expect(screen.getByLabelText('Saturday').props.accessibilityState.selected).toBe(true);
 expect(screen.getByText('• Eggs — 1')).toBeTruthy(); expect(screen.queryByText(/• Milk/)).toBeNull();
 await fireEvent.changeText(screen.getByLabelText('Recipient name'), 'Alex');
 await fireEvent.changeText(screen.getByLabelText('Recipient email'), 'alex@example.com');
 await fireEvent.changeText(screen.getByLabelText('Your phone number'), '+1 (415) 555-0123');
 expect(screen.getByRole('button', { name: 'Save weekly schedule' }).props.accessibilityState.disabled).toBe(true);
 await fireEvent(screen.getByLabelText('Authorize automatic weekly email'), 'valueChange', true);
 await fireEvent.press(screen.getByRole('button', { name: 'Save weekly schedule' }));
 await waitFor(() => expect(mockSave).toHaveBeenCalledWith('list-1', { customerPhone: '+14155550123', recipientName: 'Alex', recipient: 'alex@example.com', timeZone: 'America/Los_Angeles', weekday: 6, hour: 10, minute: 0, consent: true }));
 await screen.findByText('Weekly email scheduled.');
});
it('loads and pauses an existing schedule', async () => {
 const schedule = { customerPhone: '+14155550123', recipientName: 'Alex', recipient: 'alex@example.com', timeZone: 'UTC', weekday: 2, hour: 14, minute: 30, enabled: true, nextRunAt: '2030-01-08T14:30:00Z', runs: [] };
 mockGet.mockResolvedValue({ ...initial, schedule }); mockPause.mockResolvedValue({ ...initial, schedule: { ...schedule, enabled: false } });
 await render(<Screen />); await screen.findByText('Schedule active');
 expect(screen.getByLabelText('Delivery time').props.value).toBe('14:30');
 expect(screen.getByLabelText('Your phone number').props.value).toBe('+14155550123');
 await fireEvent.press(screen.getByRole('button', { name: 'Pause weekly emails' }));
 await screen.findByText('Schedule paused'); expect(mockPause).toHaveBeenCalledWith('list-1');
});
it('displays server failures and offers reload', async () => {
 mockGet.mockRejectedValueOnce(new Error('Sign in required.')); await render(<Screen />);
 await screen.findByText('Sign in required.'); await fireEvent.press(screen.getByRole('button', { name: 'Reload schedule' }));
 await screen.findByText('Connected · emails come from your account');
});
it('connects Gmail and refreshes the sender account', async () => {
 mockGet.mockResolvedValueOnce({ ...initial, account: null }); mockConnect.mockResolvedValue({ url: 'https://accounts.google.com/test' }); mockGmail.mockResolvedValue('v1.ticket'); mockConfirm.mockResolvedValue({ ok: true });
 await render(<Screen />); await fireEvent.press(await screen.findByRole('button', { name: 'Connect Gmail' }));
 await screen.findByText('Gmail connected. Review and save your schedule.'); expect(mockGmail).toHaveBeenCalledWith('https://accounts.google.com/test'); expect(mockConfirm).toHaveBeenCalledWith('v1.ticket');
});
