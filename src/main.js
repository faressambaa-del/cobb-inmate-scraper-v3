import { Actor } from 'apify';
import got from 'got';
import * as cheerio from 'cheerio';
import { CookieJar } from 'tough-cookie';

await Actor.init();

const input = await Actor.getInput();
const inmateName = input?.name || 'Rankin Shawn';

const baseUrl = 'http://inmate-search.cobbsheriff.org';

const searchUrl =
  `${baseUrl}/inquiry.asp?soid=&inmate_name=${encodeURIComponent(inmateName)}&serial=&qry=In+Custody`;

// 🔥 USE APIFY PROXY
const proxyConfiguration = await Actor.createProxyConfiguration({
  groups: ['RESIDENTIAL'],
});

const proxyUrl = await proxyConfiguration.newUrl();

const cookieJar = new CookieJar();

const client = got.extend({
  cookieJar,
  agent: {
    http: proxyUrl,
    https: proxyUrl,
  },
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
  }
});

// Visit base page
await client.get(baseUrl);

// Search
const searchResponse = await client.get(searchUrl);
const $search = cheerio.load(searchResponse.body);

const detailsRelativeUrl =
  $search('a[href*="InmDetails.asp"]').first().attr('href');

if (!detailsRelativeUrl) {
  console.log('Still blocked or no inmate found.');
  await Actor.exit();
}

const detailsUrl = new URL(detailsRelativeUrl, baseUrl).href;

// Details page
const detailsResponse = await client.get(detailsUrl);
const $ = cheerio.load(detailsResponse.body);

const data = {};

$('tr').each((_, row) => {
  const headers = $(row).find('th');
  const values = $(row).find('td');

  if (headers.length && values.length && headers.length === values.length) {
    headers.each((i, header) => {
      const key = $(header).text().trim();
      const value = values.eq(i).text().trim();
      if (key) data[key] = value;
    });
  }
});

await Actor.pushData(data);
await Actor.exit();
