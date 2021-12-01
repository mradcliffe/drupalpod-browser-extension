import { IssueMetadata } from '@/models/issue-metadata';
import { mockChrome, MockChrome } from '@/services/chrome';

export default class DrupalOrg {
  private chrome: any | MockChrome;

  constructor(chrome: any = mockChrome) {
    this.chrome = chrome;
  }

  static getPatchesFromLinks(linksArray: string[]): string[] {
    const patchesRegex = /^https:\/\/www\.drupal\.org\/files\/issues\/.*\.patch$/;
    const patchesFound = linksArray.filter((item) => (patchesRegex.exec(item) !== null));

    patchesFound.unshift('');
    return patchesFound;
  }

  // Checks current URL to activate extension only on relevant pages.
  static isDrupalOrgUrl(url: string): boolean {
    // Run only on Drupal issues pages, otherwise display a message
    // const projectPageRegex = /(https:\/\/www.drupal.org\/project\/)\w+\/?$/gm;
    const projectIssuePageRegex = /(https:\/\/www.drupal.org\/project\/)\w+(\/issues\/)\d+/gm;
    return projectIssuePageRegex.test(url);
  }

  static getProjectType(projectName: string): Promise<string> {
    const url = `https://www.drupal.org/api-d7/node.json?field_project_machine_name=${projectName}`;
    return fetch(url)
      .then((response) => response.json())
      .catch((e) => {
        console.error(e);
        throw e;
      });
  }

  getDrupalPodRepo(): Promise<string> {
    return new Promise((resolve) => {
      this.chrome.runtime.sendMessage({ message: 'fetch-drupalpod-repo' }, (response: any) => {
        resolve(response.message);
      });
    });
  }

  parseDrupalOrgTab(): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      this.chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any) => {
        const url: string = tabs[0].url || '';
        if (DrupalOrg.isDrupalOrgUrl(url)) {
          resolve(true);
        } else {
          reject(new Error('not-issue-page-instructions'));
        }
      });
    });
  }

  openDevEnv(
    envRepo: string,
    projectName: string,
    issueFork: string,
    issueBranch: string,
    projectType: string,
    moduleVersion: string,
    coreVersion: string,
    patchFile: string,
    installProfile: string,
  ): Promise<chrome.tabs.Tab> {
    // Build URL structure to open Gitpod.
    const url = `https://gitpod.io/#${projectName},${issueFork},${issueBranch},${projectType},${moduleVersion},${coreVersion},${patchFile},${installProfile}/${envRepo}`;
    return this.chrome.tabs.create({ url });
  }

  static getPageContent(params: any): IssueMetadata {
    const pathArray: string[] = window.location.pathname.split('/');
    const issueForkEl = document.querySelector('.fork-link') as HTMLElement;
    const issueFork = issueForkEl?.innerText || '';
    const allBranchesEl = document.querySelector('.branches') as HTMLElement;
    const allBranches: HTMLCollection = allBranchesEl?.children as HTMLCollectionOf<HTMLElement>;

    // Get links to find patches
    const allLinks = document.querySelectorAll('a') as NodeListOf<HTMLAnchorElement>;
    const duplicateAllHrefs = [];
    for (let i = 0; i < allLinks.length; i++) {
      const el = allLinks[i] as HTMLAnchorElement;
      if (el.hasAttribute('href')) {
        duplicateAllHrefs.push(el.getAttribute('href') || '');
      }
    }
    // Remove duplicate Hrefs.
    const availablePatches = DrupalOrg.getPatchesFromLinks([...new Set(duplicateAllHrefs)]);

    const issueBranches = [];
    (Array.from(allBranches) as HTMLElement[]).forEach((element: HTMLElement) => {
      issueBranches.push(element.dataset.branch);
    });
    issueBranches.unshift('');

    const versionEl = document.querySelector('.field-name-field-issue-version') as HTMLElement;
    const versionChildEl = versionEl?.children[1] as HTMLElement || null;
    const moduleVersion = versionChildEl?.innerText.replace('-dev', '') || '';
    const loggedIn = !!document.querySelector('.person');
    const pushAccess = !!document.querySelector('.push-access');

    return {
      success: true,
      pathArray,
      issueFork,
      availablePatches,
      issueBranches,
      moduleVersion,
      loggedIn,
      pushAccess,
    };
  }

  readIssueContent(): Promise<IssueMetadata> {
    return new Promise((resolve, reject) => {
      // Executes the inContent method in a IIFE inside the tab.
      this.chrome.tabs.executeScript({
        code: `(${DrupalOrg.getPageContent})(${JSON.stringify({ foo: 'bar' })})`,
      }, ([result]: any[] = []) => {
        // Hide 'please wait' message
        const pageStatusElement = document.querySelector('.reading-page-status') as HTMLElement;
        if (pageStatusElement) {
          pageStatusElement.classList.add('hidden');
        }
        if (!this.chrome.runtime.lastError) {
          resolve(result);
        } else {
          console.error(this.chrome.runtime.lastError);
          reject(new Error('something-went-wrong-instructions'));
        }
      });
    });
  }
}
