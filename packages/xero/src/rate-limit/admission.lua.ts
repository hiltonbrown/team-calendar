export const XERO_ADMISSION_SCRIPT = `
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
local operation = ARGV[1]
local tenant = ARGV[2] == 'tenant'
local minuteCap = tonumber(ARGV[3])
local dayCap = tonumber(ARGV[4])
local appCap = tonumber(ARGV[5])
local concurrentCap = tonumber(ARGV[6])
local id = ARGV[7]
if operation == 'initialise' then
  if redis.call('EXISTS', KEYS[1]) == 1 then return {'existing'} end
  if ARGV[8] == 'true' then redis.call('SET', KEYS[7], now + 86400000, 'PX', 86400000) end
  redis.call('SET', KEYS[1], '1')
  return {'initialised'}
end
if redis.call('EXISTS', KEYS[1]) == 0 then return {'infrastructure'} end
if operation == 'release' then
  redis.call('ZREM', KEYS[5], id)
  return {'released'}
end
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', now - 60000)
redis.call('ZREMRANGEBYSCORE', KEYS[3], '-inf', now - 60000)
if tenant then
  redis.call('ZREMRANGEBYSCORE', KEYS[4], '-inf', now - 86400000)
  redis.call('ZREMRANGEBYSCORE', KEYS[5], '-inf', now)
end
if operation == 'observe' then
  local ceilings = {tonumber(ARGV[8]), tonumber(ARGV[9]), tonumber(ARGV[10])}
  local windows = {KEYS[3], KEYS[4], KEYS[2]}
  local caps = {minuteCap, dayCap, appCap}
  local durations = {60000, 86400000, 60000}
  for i = 1, 3 do
    if ceilings[i] and (i ~= 2 or tenant) then
      local required = caps[i] - math.max(0, math.min(caps[i], ceilings[i]))
      local existing = redis.call('ZCARD', windows[i])
      for n = existing + 1, required do redis.call('ZADD', windows[i], now, id .. ':header:' .. i .. ':' .. n) end
      if required > existing then redis.call('PEXPIRE', windows[i], durations[i]) end
    end
  end
  local cooldown = tonumber(ARGV[11])
  if cooldown and cooldown > 0 then
    local previous = tonumber(redis.call('GET', KEYS[6])) or 0
    if now + cooldown > previous then redis.call('SET', KEYS[6], now + cooldown, 'PX', cooldown) end
  end
  return {'observed'}
end
if redis.call('ZSCORE', KEYS[2], id) then return {'admitted'} end
if tenant and tonumber(redis.call('GET', KEYS[7]) or '0') > now then return {'daily'} end
if tonumber(redis.call('GET', KEYS[6]) or '0') > now then return {'cooldown'} end
if tenant and redis.call('ZCARD', KEYS[4]) >= dayCap then return {'daily'} end
if redis.call('ZCARD', KEYS[2]) >= appCap or redis.call('ZCARD', KEYS[3]) >= minuteCap then return {'minute'} end
if tenant and redis.call('ZCARD', KEYS[5]) >= concurrentCap then return {'concurrency'} end
redis.call('ZADD', KEYS[2], now, id)
redis.call('PEXPIRE', KEYS[2], 60000)
redis.call('ZADD', KEYS[3], now, id)
redis.call('PEXPIRE', KEYS[3], 60000)
if tenant then
  redis.call('ZADD', KEYS[4], now, id)
  redis.call('PEXPIRE', KEYS[4], 86400000)
  local lease = tonumber(ARGV[8])
  redis.call('ZADD', KEYS[5], now + lease, id)
  -- Keep the key alive until its longest lease, even when later callers have shorter budgets.
  local ttl = redis.call('PTTL', KEYS[5])
  if ttl < lease then redis.call('PEXPIRE', KEYS[5], lease) end
end
return {'admitted'}
`;
