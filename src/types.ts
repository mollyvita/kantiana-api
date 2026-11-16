export interface LkPeople {
  root_id: number;
  ldap_id: string;
  type: "student" | "employee" | string;
  gender?: string;
  surname: string;
  name: string;
  patronymic?: string;
  bday?: string;
  photo_link?: string;
  main_onec_univer_id?: string;
  main_onec_univer_data?: {
    course?: number;
    form?: string;
    source?: string;
    profile?: string;
    speciality?: string;
    group?: string;
    start_year?: number;
    end_year?: number;
    [key: string]: unknown;
  };
  main_email?: string;
  main_phone?: string;
  main_address?: string;
}

export interface LkPosition {
  title: string;
  department: string;
  course?: number;
  specialty?: string;
  enrollment?: string;
  dismissal?: string;
  [key: string]: unknown;
}

export interface LkProfile {
  people: LkPeople;
  positions: LkPosition[];
  emails: string[];
  phones: string[];
  services: { name: string; role: string }[];
  [key: string]: unknown;
}

export interface LkService {
  name: string;
  role: string;
  url: string | null;
  sso: string;
}

export interface LkNotice {
  id: string;
  people_id: number;
  source: string;
  event: string;
  info_id: string;
  link: string;
  comment: string;
  active: string;
  created: string;
}

export interface LkNewsItem {
  id: string;
  title: string;
  description: string;
  [key: string]: unknown;
}

export interface LkPaged<T> {
  items: T[];
  count: number;
  offset: number;
  total: number;
}

export interface LkClass {
  groups: string[];
  subgroup: string;
  teachers: string[];
  time: { start: string; end: string };
  lesson: { title: string; type: string };
  location: { address: string; room: string };
}

export interface LkScheduleDay {
  date: string;
  classes: LkClass[];
}

export interface LkTeacher {
  onec_univer_id: string;
  surname: string;
  name: string;
  patronymic?: string;
}

export interface MoodleSiteInfo {
  sitename: string;
  username: string;
  firstname: string;
  lastname: string;
  fullname: string;
  userid: number;
  siteurl: string;
  userpictureurl: string;
  release: string;
  functions: { name: string; version: string }[];
  [key: string]: unknown;
}

export interface MoodleCourse {
  id: number;
  shortname: string;
  fullname: string;
  displayname?: string;
  summary?: string;
  progress?: number | null;
  completed?: boolean;
  startdate?: number;
  enddate?: number;
  lastaccess?: number | null;
  courseimage?: string;
  [key: string]: unknown;
}

export interface MoodleModuleContent {
  type: string;
  filename: string;
  filepath?: string;
  filesize?: number;
  fileurl?: string;
  mimetype?: string;
  timemodified?: number;
  [key: string]: unknown;
}

export interface MoodleModule {
  id: number;
  name: string;
  modname: string;
  instance: number;
  url?: string;
  description?: string;
  visible?: number;
  contents?: MoodleModuleContent[];
  dates?: { label: string; timestamp: number }[];
  completiondata?: { state: number; [key: string]: unknown };
  [key: string]: unknown;
}

export interface MoodleSection {
  id: number;
  name: string;
  summary: string;
  section: number;
  visible?: number;
  modules: MoodleModule[];
}

export interface MoodleAssignment {
  id: number;
  cmid: number;
  course: number;
  name: string;
  intro?: string;
  duedate: number;
  cutoffdate?: number;
  allowsubmissionsfromdate?: number;
  grade?: number;
  introattachments?: MoodleModuleContent[];
  configs?: { plugin: string; subtype: string; name: string; value: string }[];
  [key: string]: unknown;
}

export interface MoodleEvent {
  id: number;
  name: string;
  description?: string;
  modulename?: string;
  instance?: number;
  eventtype: string;
  timestart: number;
  timeduration?: number;
  timesort?: number;
  course?: { id: number; fullname: string };
  url?: string;
  action?: { name: string; url: string; actionable: boolean };
  [key: string]: unknown;
}
