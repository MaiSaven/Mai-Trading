//+------------------------------------------------------------------+
//|                                                     MAI_Sync.mq5 |
//|                              MAI Trading Journal - MT5 Connector |
//|                                                                   |
//|  Syncs account, open positions, and deal history to the MAI       |
//|  Trading Journal web server via HTTPS POST.                       |
//|                                                                   |
//|  SETUP:                                                           |
//|   1. Compile in MetaEditor (F7)                                   |
//|   2. MT5 → Tools → Options → Expert Advisors →                   |
//|      ✓ Allow WebRequests for listed URL → add your server URL     |
//|   3. Drag the EA onto any chart (e.g. EURUSD H1)                 |
//|   4. Fill in Inputs: ServerURL, APIKey, SyncIntervalSeconds       |
//+------------------------------------------------------------------+
#property copyright "MAI Trading Journal"
#property version   "1.00"
#property strict

//--- Input parameters (shown in MT5 "Inputs" tab)
input string ServerURL          = "http://172.20.10.7:8000/api/v1/sync"; // Server Sync URL
input string APIKey             = "mai-trading-secret-key";                // API Key (X-API-Key header)
input int    SyncIntervalSeconds = 10;                                     // Sync interval (seconds)
input int    HistoryDays        = 60;                                      // Deal history lookback (days)
input bool   EnableLogging      = true;                                    // Print sync status to Experts log

//--- Global state
datetime g_lastSync = 0;

//+------------------------------------------------------------------+
//| Expert initialization                                            |
//+------------------------------------------------------------------+
int OnInit()
{
   if(StringLen(APIKey) == 0)
   {
      Alert("MAI Sync: APIKey is empty. Please set it in EA Inputs.");
      return INIT_FAILED;
   }
   if(StringLen(ServerURL) == 0)
   {
      Alert("MAI Sync: ServerURL is empty. Please set it in EA Inputs.");
      return INIT_FAILED;
   }

   int intervalMs = SyncIntervalSeconds * 1000;
   if(intervalMs < 5000) intervalMs = 5000; // minimum 5 s
   EventSetMillisecondTimer(intervalMs);

   if(EnableLogging)
      PrintFormat("MAI Sync started. Server: %s | Interval: %d s | History: %d days",
                  ServerURL, SyncIntervalSeconds, HistoryDays);

   // Sync immediately on init
   DoSync();
   return INIT_SUCCEEDED;
}

//+------------------------------------------------------------------+
//| Expert deinitialization                                          |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   EventKillTimer();
   if(EnableLogging)
      Print("MAI Sync stopped.");
}

//+------------------------------------------------------------------+
//| Timer event – fires every SyncIntervalSeconds                    |
//+------------------------------------------------------------------+
void OnTimer()
{
   DoSync();
}

//+------------------------------------------------------------------+
//| Main sync routine                                                |
//+------------------------------------------------------------------+
void DoSync()
{
   string json = BuildPayload();
   if(StringLen(json) == 0)
   {
      if(EnableLogging) Print("MAI Sync: Failed to build payload.");
      return;
   }

   int    result = SendPayload(json);
   g_lastSync = TimeCurrent();

   if(EnableLogging)
   {
      if(result == 200 || result == 201)
         PrintFormat("MAI Sync OK [%d] at %s", result, TimeToString(g_lastSync, TIME_DATE|TIME_SECONDS));
      else
         PrintFormat("MAI Sync FAILED [HTTP %d] at %s", result, TimeToString(g_lastSync, TIME_DATE|TIME_SECONDS));
   }
}

//+------------------------------------------------------------------+
//| Build the full JSON payload matching SyncPayload schema          |
//+------------------------------------------------------------------+
string BuildPayload()
{
   //--- Account section
   long   login       = AccountInfoInteger(ACCOUNT_LOGIN);
   string server      = AccountInfoString(ACCOUNT_SERVER);
   string broker      = AccountInfoString(ACCOUNT_COMPANY);
   string currency    = AccountInfoString(ACCOUNT_CURRENCY);
   double balance     = AccountInfoDouble(ACCOUNT_BALANCE);
   double equity      = AccountInfoDouble(ACCOUNT_EQUITY);
   double margin      = AccountInfoDouble(ACCOUNT_MARGIN);
   double freeMargin  = AccountInfoDouble(ACCOUNT_FREEMARGIN);
   long   leverage    = AccountInfoInteger(ACCOUNT_LEVERAGE);
   double profit      = AccountInfoDouble(ACCOUNT_PROFIT);

   // account_id = login (the backend will compute SHA-256 synthetic id
   // from (broker, login, server) server-side; we just send login as account_id)
   string accountJson = StringFormat(
      "{\"account_id\":%I64d,\"login\":%I64d,\"server\":\"%s\","
      "\"broker\":\"%s\",\"currency\":\"%s\","
      "\"balance\":%.2f,\"equity\":%.2f,\"margin\":%.2f,"
      "\"free_margin\":%.2f,\"leverage\":%I64d,\"profit\":%.2f}",
      login, login,
      EscapeJson(server),
      EscapeJson(broker),
      EscapeJson(currency),
      balance, equity, margin,
      freeMargin, leverage, profit
   );

   //--- Positions section
   string positionsJson = "[";
   int posTotal = PositionsTotal();
   for(int i = 0; i < posTotal; i++)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;

      string symbol      = PositionGetString(POSITION_SYMBOL);
      int    posType     = (int)PositionGetInteger(POSITION_TYPE); // 0=BUY, 1=SELL
      double volume      = PositionGetDouble(POSITION_VOLUME);
      double priceOpen   = PositionGetDouble(POSITION_PRICE_OPEN);
      double priceCurrent= PositionGetDouble(POSITION_PRICE_CURRENT);
      double sl          = PositionGetDouble(POSITION_SL);
      double tp          = PositionGetDouble(POSITION_TP);
      double posProfit   = PositionGetDouble(POSITION_PROFIT);
      double swap        = PositionGetDouble(POSITION_SWAP);
      long   posTime     = (long)PositionGetInteger(POSITION_TIME);
      string typeStr     = (posType == POSITION_TYPE_BUY) ? "BUY" : "SELL";

      if(i > 0) positionsJson += ",";
      positionsJson += StringFormat(
         "{\"ticket\":%I64u,\"symbol\":\"%s\",\"type\":\"%s\","
         "\"volume\":%.2f,\"price_open\":%.5f,\"price_current\":%.5f,"
         "\"sl\":%.5f,\"tp\":%.5f,\"profit\":%.2f,\"swap\":%.2f,\"time\":%I64d}",
         ticket,
         EscapeJson(symbol),
         typeStr,
         volume, priceOpen, priceCurrent,
         sl, tp, posProfit, swap, posTime
      );
   }
   positionsJson += "]";

   //--- Deals (history) section
   datetime fromTime = TimeCurrent() - (datetime)(HistoryDays * 86400);
   datetime toTime   = TimeCurrent();
   HistorySelect(fromTime, toTime);

   string dealsJson = "[";
   int dealTotal = HistoryDealsTotal();
   bool firstDeal = true;
   for(int i = 0; i < dealTotal; i++)
   {
      ulong dealTicket = HistoryDealGetTicket(i);
      if(dealTicket == 0) continue;

      long   dealId     = (long)dealTicket;
      long   orderId    = (long)HistoryDealGetInteger(dealTicket, DEAL_ORDER);
      long   posId      = (long)HistoryDealGetInteger(dealTicket, DEAL_POSITION_ID);
      string symbol     = HistoryDealGetString(dealTicket, DEAL_SYMBOL);
      int    dealType   = (int)HistoryDealGetInteger(dealTicket, DEAL_TYPE);
      int    dealEntry  = (int)HistoryDealGetInteger(dealTicket, DEAL_ENTRY);
      double volume     = HistoryDealGetDouble(dealTicket, DEAL_VOLUME);
      double price      = HistoryDealGetDouble(dealTicket, DEAL_PRICE);
      double dealProfit = HistoryDealGetDouble(dealTicket, DEAL_PROFIT);
      double commission = HistoryDealGetDouble(dealTicket, DEAL_COMMISSION);
      double swap       = HistoryDealGetDouble(dealTicket, DEAL_SWAP);
      long   dealTime   = (long)HistoryDealGetInteger(dealTicket, DEAL_TIME);

      // Map DEAL_TYPE to BUY / SELL string
      string typeStr;
      if(dealType == DEAL_TYPE_BUY)        typeStr = "BUY";
      else if(dealType == DEAL_TYPE_SELL)  typeStr = "SELL";
      else                                 typeStr = "OTHER";

      // Map DEAL_ENTRY to IN / OUT / INOUT string
      string entryStr;
      if(dealEntry == DEAL_ENTRY_IN)       entryStr = "IN";
      else if(dealEntry == DEAL_ENTRY_OUT) entryStr = "OUT";
      else                                 entryStr = "INOUT";

      // Skip balance/credit/non-trade deals that have no symbol
      if(StringLen(symbol) == 0 && dealProfit == 0.0) continue;

      if(!firstDeal) dealsJson += ",";
      firstDeal = false;

      dealsJson += StringFormat(
         "{\"deal_id\":%I64d,\"order_id\":%I64d,\"position_id\":%I64d,"
         "\"symbol\":\"%s\",\"type\":\"%s\",\"entry\":\"%s\","
         "\"volume\":%.2f,\"price\":%.5f,\"profit\":%.2f,"
         "\"commission\":%.2f,\"swap\":%.2f,\"time\":%I64d}",
         dealId, orderId, posId,
         EscapeJson(symbol),
         typeStr, entryStr,
         volume, price, dealProfit,
         commission, swap, dealTime
      );
   }
   dealsJson += "]";

   //--- Assemble full payload
   string payload = StringFormat(
      "{\"account\":%s,\"positions\":%s,\"deals\":%s}",
      accountJson, positionsJson, dealsJson
   );

   return payload;
}

//+------------------------------------------------------------------+
//| Send JSON payload via HTTP POST, returns HTTP status code        |
//+------------------------------------------------------------------+
int SendPayload(const string &json)
{
   uchar  dataOut[];
   uchar  dataIn[];
   string headers    = "Content-Type: application/json\r\nX-API-Key: " + APIKey;
   string resultHeaders;
   int    timeout    = 10000; // 10 s

   // Convert JSON string to uchar array
   StringToCharArray(json, dataOut, 0, StringLen(json));

   int httpCode = WebRequest(
      "POST",
      ServerURL,
      headers,
      timeout,
      dataOut,
      dataIn,
      resultHeaders
   );

   if(httpCode == -1)
   {
      int err = GetLastError();
      if(EnableLogging)
         PrintFormat("MAI Sync: WebRequest error %d. "
                     "Check MT5 → Tools → Options → Expert Advisors → Allow WebRequests for: %s",
                     err, ServerURL);
   }

   return httpCode;
}

//+------------------------------------------------------------------+
//| Escape special characters inside a JSON string value            |
//+------------------------------------------------------------------+
string EscapeJson(const string &s)
{
   string out = s;
   // Order matters: backslash first
   StringReplace(out, "\\", "\\\\");
   StringReplace(out, "\"", "\\\"");
   StringReplace(out, "\n", "\\n");
   StringReplace(out, "\r", "\\r");
   StringReplace(out, "\t", "\\t");
   return out;
}
//+------------------------------------------------------------------+

