import { createMMKV } from 'react-native-mmkv';
import { createHistoryStore } from './historyStore';

export { verifyChain } from './historyStore';

export type { HistoryRecord, StoredAlert, VerifyResult } from './historyStore';

export const historyStore = createHistoryStore(createMMKV({ id: 'offgrid-rcb-history' }));
